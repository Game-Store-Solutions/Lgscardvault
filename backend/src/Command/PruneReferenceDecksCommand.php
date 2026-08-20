<?php

namespace App\Command;

use App\Message\PruneReferenceDecksMessage;
use App\Service\Recommend\Intelligence\ReferenceDeckPruner;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Messenger\MessageBusInterface;

/**
 * Drop stale reference deck card rows (and optionally deck headers).
 *
 *   app:commanders:prune-reference-decks
 *   app:commanders:prune-reference-decks --batch=1000 --async
 */
#[AsCommand(
    name: 'app:commanders:prune-reference-decks',
    description: 'Prune stale reference decklists after intelligence aggregates settle',
)]
final class PruneReferenceDecksCommand extends Command
{
    public function __construct(
        private readonly ReferenceDeckPruner $pruner,
        private readonly MessageBusInterface $bus,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addOption('batch', 'b', InputOption::VALUE_REQUIRED, 'Maximum decks to prune this run', '500')
            ->addOption('async', null, InputOption::VALUE_NONE, 'Queue the prune on the async worker');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $batch = max(1, (int) $input->getOption('batch'));

        if ((bool) $input->getOption('async')) {
            $this->bus->dispatch(new PruneReferenceDecksMessage($batch));
            $io->success(sprintf('Queued reference-deck prune (batch=%d).', $batch));

            return Command::SUCCESS;
        }

        $result = $this->pruner->prune($batch);
        $io->success(sprintf(
            'Pruned %d reference deck(s) and %d card row(s).',
            $result['decks'],
            $result['cards'],
        ));

        return Command::SUCCESS;
    }
}
