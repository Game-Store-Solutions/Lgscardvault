<?php

namespace App\Command;

use App\Service\Payments\SubscriptionRenewer;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Charges subscriptions that have come due. Runs nightly via {@see \App\Schedule};
 * this command exists for manual runs and for inspecting the queue with --dry-run.
 */
#[AsCommand(name: 'app:subscriptions:charge', description: 'Charge vaulted Square cards for subscriptions that have come due')]
final class ChargeSubscriptionsCommand extends Command
{
    public function __construct(private readonly SubscriptionRenewer $renewer)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'List what would be charged without calling Square');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = (bool) $input->getOption('dry-run');

        $results = $this->renewer->run($dryRun);

        if ([] === $results) {
            $io->success('Nothing due.');

            return Command::SUCCESS;
        }

        $failed = 0;
        foreach ($results as $result) {
            $line = sprintf('%-24s %-14s %s', $result['slug'], $result['outcome'], $result['detail']);

            if (in_array($result['outcome'], ['declined', 'no_card'], true)) {
                ++$failed;
                $io->writeln('<error>'.$line.'</error>');
                continue;
            }

            $io->writeln($line);
        }

        $io->newLine();
        $io->success(sprintf('%d due, %d failed.%s', count($results), $failed, $dryRun ? ' (dry run)' : ''));

        return Command::SUCCESS;
    }
}
