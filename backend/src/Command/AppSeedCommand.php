<?php

namespace App\Command;

use App\Entity\Card;
use App\Entity\InventoryItem;
use App\Entity\Store;
use App\Entity\User;
use App\Enum\CardCondition;
use App\Service\Scryfall\ScryfallClient;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(name: 'app:seed', description: 'Seed demo users, store, and sample inventory')]
class AppSeedCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UserPasswordHasherInterface $passwordHasher,
        private readonly ScryfallClient $scryfallClient,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        if ($this->entityManager->getRepository(User::class)->findOneBy(['email' => 'admin@store.local'])) {
            $io->warning('Seed data already exists. Skipping.');

            return Command::SUCCESS;
        }

        $superAdmin = (new User())
            ->setEmail('admin@store.local')
            ->setDisplayName('Platform Admin')
            ->setRoles(['ROLE_SUPER_ADMIN'])
            ->setPassword($this->passwordHasher->hashPassword(new User(), 'password123'));

        $storeOwner = (new User())
            ->setEmail('owner@store.local')
            ->setDisplayName('Acme Owner')
            ->setRoles(['ROLE_STORE_OWNER'])
            ->setPassword($this->passwordHasher->hashPassword(new User(), 'password123'));

        $customer = (new User())
            ->setEmail('customer@store.local')
            ->setDisplayName('Demo Customer')
            ->setRoles(['ROLE_USER'])
            ->setPassword($this->passwordHasher->hashPassword(new User(), 'password123'));

        $store = (new Store())
            ->setName('Acme TCG')
            ->setSlug('acme-tcg')
            ->setOwner($storeOwner)
            ->setIsActive(true);

        $this->entityManager->persist($superAdmin);
        $this->entityManager->persist($storeOwner);
        $this->entityManager->persist($customer);
        $this->entityManager->persist($store);
        $this->entityManager->flush();

        $io->section('Fetching sample cards from Scryfall');
        $cards = $this->scryfallClient->searchRemoteAndUpsert('lightning bolt', 3);
        if ([] === $cards) {
            $io->error('Could not fetch sample cards from Scryfall.');

            return Command::FAILURE;
        }

        foreach ($cards as $index => $card) {
            $item = (new InventoryItem())
                ->setStore($store)
                ->setCard($card)
                ->setQuantity(4 + $index)
                ->setPriceCents(199 + ($index * 100))
                ->setCondition(CardCondition::NM)
                ->applyFinish(2 === $index ? 'Foil' : 'Nonfoil')
                ->setNotes('Demo inventory item');

            $this->entityManager->persist($item);
        }

        $this->entityManager->flush();

        $io->success('Seed complete.');
        $io->listing([
            'Super admin: admin@store.local / password123',
            'Store owner: owner@store.local / password123',
            'Customer: customer@store.local / password123',
            'Demo store: /s/acme-tcg',
        ]);

        return Command::SUCCESS;
    }
}
