<?php

namespace App\Command;

use App\Service\Inventory\LegacyGameLinkRepairer;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:inventory:repair-game-links',
    description: 'Re-home listings whose "Game: X" note contradicts their game-less card (pre-multi-game import residue)',
)]
final class RepairGameLinksCommand extends Command
{
    public function __construct(private readonly LegacyGameLinkRepairer $repairer)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'Report what would change without writing anything');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = (bool) $input->getOption('dry-run');

        $report = $this->repairer->repair($dryRun);

        $io->definitionList(
            ['Re-pointed to catalog cards' => $report['repointed']],
            ['Merged into existing lines' => $report['merged']],
            ['Cards tagged in place' => $report['retagged']],
            ['Unresolved' => count($report['unresolved'])],
        );

        foreach ($report['unresolved'] as $line) {
            $io->warning($line);
        }

        if ($dryRun) {
            $io->note('Dry run — nothing was written.');
        }

        return Command::SUCCESS;
    }
}
