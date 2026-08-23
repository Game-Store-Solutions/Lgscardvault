<?php

namespace App\Command;

use App\Entity\PrivacyRequest;
use App\Service\Mail\TransactionalMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/** Emails LEGAL_CONTACT_EMAIL a digest of open privacy requests past the 45-day SLA. */
#[AsCommand(name: 'app:privacy:sla-remind', description: 'Email a digest of overdue privacy / takedown requests')]
final class PrivacySlaRemindCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly TransactionalMailer $mailer,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'List overdue requests without sending mail');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $dryRun = (bool) $input->getOption('dry-run');
        $cutoff = (new \DateTimeImmutable())->modify('-'.PrivacyRequest::SLA_DAYS.' days');

        /** @var list<PrivacyRequest> $rows */
        $rows = $this->entityManager->getRepository(PrivacyRequest::class)->createQueryBuilder('p')
            ->where('p.status IN (:open)')
            ->andWhere('p.createdAt <= :cutoff')
            ->setParameter('open', [PrivacyRequest::STATUS_RECEIVED, PrivacyRequest::STATUS_IN_PROGRESS])
            ->setParameter('cutoff', $cutoff)
            ->orderBy('p.createdAt', 'ASC')
            ->getQuery()
            ->getResult();

        if ([] === $rows) {
            $io->success('No overdue privacy requests.');

            return Command::SUCCESS;
        }

        $io->warning(sprintf('%d open request(s) past %d days.', count($rows), PrivacyRequest::SLA_DAYS));
        foreach ($rows as $row) {
            $io->text(sprintf('#%d %s %s %s', $row->getId(), $row->getType(), $row->getEmail(), $row->getCreatedAt()->format('Y-m-d')));
        }

        if ($dryRun) {
            $io->note('Dry run — no email sent.');

            return Command::SUCCESS;
        }

        $recipient = trim((string) ($_ENV['LEGAL_CONTACT_EMAIL'] ?? $_SERVER['LEGAL_CONTACT_EMAIL'] ?? ''));
        if ('' === $recipient || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            $io->error('LEGAL_CONTACT_EMAIL is not set; cannot send the digest.');

            return Command::FAILURE;
        }

        $lines = array_map(
            static fn (PrivacyRequest $row): string => sprintf(
                "#%d %s from %s <%s> received %s",
                $row->getId(),
                $row->getType(),
                $row->getName(),
                $row->getEmail(),
                $row->getCreatedAt()->format(DATE_ATOM),
            ),
            $rows,
        );
        $body = "These privacy / takedown requests are still open after ".PrivacyRequest::SLA_DAYS." days:\n\n".implode("\n", $lines);

        $this->mailer->sendHtml(
            to: $recipient,
            subject: sprintf('%d overdue privacy request(s)', count($rows)),
            htmlTemplate: 'emails/platform/contact_enquiry.html.twig',
            context: [
                'preheader' => 'Privacy request SLA reminder.',
                'senderName' => 'Privacy SLA',
                'senderEmail' => $recipient,
                'messageBody' => $body,
                'footerNote' => 'Complete them in Platform admin → Privacy.',
            ],
            textBody: $body,
            store: null,
        );
        $io->success('Digest emailed to '.$recipient);

        return Command::SUCCESS;
    }
}
