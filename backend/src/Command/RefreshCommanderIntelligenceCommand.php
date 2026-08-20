<?php

namespace App\Command;

use App\Entity\Card;
use App\Entity\Commander;
use App\Message\RefreshCommanderIntelligenceMessage;
use App\Repository\CardRepository;
use App\Repository\CommanderRepository;
use App\Service\Recommend\Intelligence\CommanderIntelligenceRefresher;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Messenger\MessageBusInterface;

/**
 * Harvest reference decks and rebuild commander intelligence aggregates.
 *
 * Two modes:
 *
 *   app:commanders:intelligence --commander="Anim Pakal, Thousandth Moon"
 *   app:commanders:intelligence --top=400 --async
 *
 * The `--top` backfill is the one-time warm-up: at one provider request per
 * second a commander costs roughly a minute, so the few hundred commanders that
 * matter finish in a few hours and everything else can warm lazily on first use.
 */
#[AsCommand(
    name: 'app:commanders:intelligence',
    description: 'Harvest reference decks and rebuild commander/strategy card statistics',
)]
final class RefreshCommanderIntelligenceCommand extends Command
{
    public function __construct(
        private readonly CommanderRepository $commanders,
        private readonly CardRepository $cards,
        private readonly CommanderIntelligenceRefresher $refresher,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('commander', 'c', InputOption::VALUE_REQUIRED, 'Commander name or card id')
            ->addOption('top', 't', InputOption::VALUE_REQUIRED, 'Refresh the N most-played commanders')
            ->addOption('offset', 'o', InputOption::VALUE_REQUIRED, 'Skip the first N commanders (resume a backfill)', '0')
            ->addOption('async', null, InputOption::VALUE_NONE, 'Queue the work instead of running it inline');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $async = (bool) $input->getOption('async');

        $targets = $this->resolveTargets($input, $io);
        if (null === $targets) {
            return Command::FAILURE;
        }
        if ([] === $targets) {
            $io->warning('No commanders matched.');

            return Command::SUCCESS;
        }

        if ($async) {
            foreach ($targets as $card) {
                $this->bus->dispatch(new RefreshCommanderIntelligenceMessage((string) $card->getId()));
            }
            $io->success(sprintf('Queued %d commander refresh job(s).', count($targets)));

            return Command::SUCCESS;
        }

        $io->progressStart(count($targets));
        $totalDecks = 0;
        $totalStats = 0;
        foreach ($targets as $card) {
            $result = $this->refresher->refresh($card);
            $totalDecks += $result['decks'];
            $totalStats += $result['cardStats'];
            $io->progressAdvance();
        }
        $io->progressFinish();

        $io->success(sprintf(
            '%d commander(s): %d reference decks harvested, %d card stats written.',
            count($targets),
            $totalDecks,
            $totalStats,
        ));

        return Command::SUCCESS;
    }

    /**
     * @return list<Card>|null null signals a usage error
     */
    private function resolveTargets(InputInterface $input, SymfonyStyle $io): ?array
    {
        $commander = trim((string) $input->getOption('commander'));
        $top = $input->getOption('top');

        if ('' !== $commander) {
            $card = $this->cards->findOneMagicById($commander) ?? $this->cards->findOneByExactName($commander);
            if (!$card instanceof Card) {
                $io->error(sprintf('Commander "%s" not found in the local catalog.', $commander));

                return null;
            }

            return [$card];
        }

        if (null === $top) {
            $io->error('Pass --commander=<name|id> or --top=<n>.');

            return null;
        }

        $limit = max(1, (int) $top);
        $offset = max(0, (int) $input->getOption('offset'));

        return array_values(array_filter(array_map(
            static fn (Commander $c): ?Card => $c->getCard(),
            $this->commanders->findMostPlayed($limit, $offset),
        )));
    }
}
