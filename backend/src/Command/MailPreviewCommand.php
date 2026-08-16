<?php

namespace App\Command;

use App\Entity\Order;
use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\User;
use App\Enum\OrderStatus;
use App\Repository\StoreRepository;
use App\Service\Mail\TransactionalMailer;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Sends sample branded emails to Mailpit (or whatever MAILER_DSN points at).
 *
 *   php bin/console app:mail:preview --to=you@example.com
 *
 * Platform samples use LGS navy/gold. The store sample uses a distinctly
 * colored fake store so the branding split is obvious in Mailpit.
 */
#[AsCommand(name: 'app:mail:preview', description: 'Send sample transactional emails for Mailpit preview')]
final class MailPreviewCommand extends Command
{
    public function __construct(
        private readonly TransactionalMailer $mail,
        private readonly StoreRepository $stores,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('to', null, InputOption::VALUE_REQUIRED, 'Recipient email', 'preview@lgscardvault.local');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $to = (string) $input->getOption('to');

        $customer = (new User())
            ->setEmail($to)
            ->setDisplayName('Alex Preview')
            ->setRoles(['ROLE_USER']);
        $customer->setPassword('unused');

        $owner = (new User())
            ->setEmail($to)
            ->setDisplayName('Sam Owner')
            ->setRoles(['ROLE_USER', 'ROLE_STORE_OWNER']);
        $owner->setPassword('unused');

        $io->section('Platform — welcome (customer) [LGS branding]');
        $this->mail->sendWelcome($customer);

        $io->section('Platform — welcome (owner) [LGS branding]');
        $this->mail->sendWelcome($owner);

        // Content only for approve/reject — branding stays platform (LGS).
        $namedStore = $this->stores->findOneBy([]) ?? $this->namedStore($owner);

        $io->section('Platform — store approved [LGS branding]');
        $this->mail->sendStoreApproved($namedStore);

        $io->section('Platform — store rejected [LGS branding]');
        $this->mail->sendStoreRejected($namedStore, 'Please add a clearer store description and try again.');

        // Distinct store palette so Mailpit contrast vs platform is obvious.
        $brandedStore = $this->brandedPreviewStore($owner);
        $order = (new Order())
            ->setStore($brandedStore)
            ->setCustomerEmail($to)
            ->setReference('PREV-1001')
            ->setStatus(OrderStatus::FULFILLED)
            ->setTotalCents(4299);

        $io->section('Store — order fulfilled [store branding / ready for pickup]');
        $this->mail->sendOrderFulfilled($order, $customer, $brandedStore);

        $sellTrade = (new SellSubmission())
            ->setStore($brandedStore)
            ->setUser($customer)
            ->setPayoutMethod(SellSubmission::PAYOUT_CREDIT)
            ->setTotalOfferCents(1850);

        $io->section('Store — sell/trade accepted [store branding]');
        $this->mail->sendSellTradeAccepted($sellTrade, $customer, $brandedStore);

        $io->section('Store — sell/trade declined [store branding]');
        $this->mail->sendSellTradeDeclined($sellTrade, $customer, $brandedStore);

        $io->success(sprintf(
            'Sent 7 sample emails to %s. Open Mailpit at http://127.0.0.1:8025',
            $to,
        ));
        $io->writeln('Platform mails: LGS logo + navy/gold. Store mail: store colors/name (and store logo when set).');

        return Command::SUCCESS;
    }

    private function namedStore(User $owner): Store
    {
        return (new Store())
            ->setName('Acme Game Store')
            ->setSlug('acme-game-store')
            ->setOwner($owner);
    }

    /**
     * Intentionally non-LGS colors so store vs platform is easy to spot.
     * No logoUrl — production store mail uses the store's uploaded logo when set;
     * otherwise the header shows the store name only (never the LGS mark).
     */
    private function brandedPreviewStore(User $owner): Store
    {
        return (new Store())
            ->setName('Preview Game Store')
            ->setSlug('preview-game-store')
            ->setOwner($owner)
            ->setPrimaryColor('#0f766e')
            ->setAccentColor('#f59e0b');
    }
}
