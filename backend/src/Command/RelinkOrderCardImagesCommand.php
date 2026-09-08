<?php

namespace App\Command;

use App\Repository\StoreRepository;
use App\Service\Order\OrderHistoryCsvImporter;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:relink-order-card-images',
    description: 'Attach catalog cards to imported order lines so customer history shows art',
)]
final class RelinkOrderCardImagesCommand extends Command
{
    public function __construct(
        private readonly StoreRepository $stores,
        private readonly OrderHistoryCsvImporter $importer,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('storeSlug', InputArgument::REQUIRED, 'Store slug to repair');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $slug = trim((string) $input->getArgument('storeSlug'));
        $store = $this->stores->findOneBySlug($slug);
        if (null === $store) {
            $io->error(sprintf('Store "%s" not found.', $slug));

            return Command::FAILURE;
        }

        $result = $this->importer->relinkMissingCards($store);
        $io->success(sprintf(
            'Examined %d lines · linked %d · unmatched %d',
            $result['examined'],
            $result['linked'],
            $result['unmatched'],
        ));
        if ($result['samples'] !== []) {
            $io->listing($result['samples']);
        }

        return Command::SUCCESS;
    }
}
