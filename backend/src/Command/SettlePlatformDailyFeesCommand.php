<?php

namespace App\Command;

use App\Service\Billing\PlatformDailyFeeSettler;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Settles usage-plan platform fees for closed business days. Runs nightly via
 * {@see \App\Scheduler\BillingSchedule}; this command is for manual runs.
 */
#[AsCommand(
    name: 'app:platform-fees:settle',
    description: 'Charge vaulted cards for usage-plan daily platform fees',
)]
final class SettlePlatformDailyFeesCommand extends Command
{
    public function __construct(private readonly PlatformDailyFeeSettler $settler)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'List what would be charged without calling the processor');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = (bool) $input->getOption('dry-run');

        $results = $this->settler->run($dryRun);

        if ([] === $results) {
            $io->success('Nothing to settle.');

            return Command::SUCCESS;
        }

        $failed = 0;
        foreach ($results as $result) {
            $line = sprintf(
                '%-24s %-10s %-14s %s',
                $result['slug'],
                $result['date'],
                $result['outcome'],
                $result['detail'],
            );

            if (in_array($result['outcome'], ['declined', 'no_card'], true)) {
                ++$failed;
                $io->writeln('<error>'.$line.'</error>');
                continue;
            }

            $io->writeln($line);
        }

        $io->newLine();
        $io->success(sprintf('%d ledgers, %d failed.%s', count($results), $failed, $dryRun ? ' (dry run)' : ''));

        return Command::SUCCESS;
    }
}
