<?php

namespace App\Command;

use App\Entity\CatalogSyncRun;
use App\Repository\GameRepository;
use App\Service\Tcgcsv\CatalogSyncRunner;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Runs a TCGCSV catalog sync inline. Point a daily cron at
 * `app:catalog:sync --all` (TCGCSV refreshes at 20:00 UTC) to keep every
 * game's sets, cards, sealed products, and prices current.
 */
#[AsCommand(name: 'app:catalog:sync', description: 'Sync game catalogs (sets, cards, sealed, prices) from TCGCSV')]
class CatalogSyncCommand extends Command
{
    public function __construct(
        private readonly CatalogSyncRunner $runner,
        private readonly GameRepository $gameRepository,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('game', InputArgument::OPTIONAL, 'Game code to sync (mtg, pokemon, onepiece, fab, riftbound)')
            ->addOption('all', null, InputOption::VALUE_NONE, 'Sync every active game that has a TCGCSV category')
            ->addOption(
                'max-groups',
                null,
                InputOption::VALUE_REQUIRED,
                'Stop after this many sets — use it to smoke-test a game before running the full catalog',
            );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        $gameCode = $input->getArgument('game');
        $codes = [];
        if ($input->getOption('all')) {
            foreach ($this->gameRepository->findActive() as $game) {
                if (null !== $game->getTcgcsvCategoryId()) {
                    $codes[] = $game->getCode();
                }
            }
        } elseif (is_string($gameCode) && '' !== $gameCode) {
            // A typo deserves the list of valid codes, not a stack trace.
            if (null === $this->gameRepository->findOneByCode($gameCode)) {
                $known = array_map(static fn ($game): string => $game->getCode(), $this->gameRepository->findActive());
                $io->error(sprintf('Unknown game "%s". Known games: %s.', $gameCode, implode(', ', $known) ?: 'none'));

                return Command::INVALID;
            }
            $codes[] = strtolower($gameCode);
        } else {
            $io->error('Pass a game code or --all.');

            return Command::INVALID;
        }

        $maxGroupsOption = $input->getOption('max-groups');
        $maxGroups = is_numeric($maxGroupsOption) ? max(1, (int) $maxGroupsOption) : null;

        $failed = 0;
        foreach ($codes as $code) {
            $io->section(sprintf('Syncing %s from TCGCSV%s', $code, null !== $maxGroups ? sprintf(' (first %d sets)', $maxGroups) : ''));

            // A full catalog is thousands of paced requests; print each set as
            // it lands so a long first run is visibly making progress.
            $run = $this->runner->run($code, $maxGroups, static function (string $group, int $done) use ($io): void {
                $io->writeln(
                    sprintf('  <fg=gray>%4d</> %s <fg=gray>(%.0f MB)</>', $done, $group, memory_get_usage(true) / 1048576),
                    OutputInterface::VERBOSITY_VERBOSE,
                );
            });

            if (CatalogSyncRun::STATUS_SUCCEEDED === $run->getStatus()) {
                $summary = $run->getSummary() ?? [];
                $io->success(sprintf(
                    '%s: %d sets synced, %d created, %d updated, %d cards upserted, %d sealed upserted%s.',
                    $code,
                    $summary['groupsSeen'] ?? 0,
                    $summary['setsCreated'] ?? 0,
                    $summary['setsUpdated'] ?? 0,
                    $summary['cardsUpserted'] ?? 0,
                    $summary['sealedUpserted'] ?? 0,
                    ($summary['groupsFailed'] ?? 0) > 0 ? sprintf(', %d sets failed', $summary['groupsFailed']) : '',
                ));
                foreach ((array) ($summary['failures'] ?? []) as $failure) {
                    $io->warning((string) $failure);
                }
            } else {
                ++$failed;
                $io->error(sprintf('%s: sync failed — %s', $code, $run->getError() ?? 'unknown error'));
            }
        }

        return 0 === $failed ? Command::SUCCESS : Command::FAILURE;
    }
}
