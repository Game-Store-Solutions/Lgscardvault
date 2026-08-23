<?php

namespace App\Service\Mail;

use App\Entity\SellSubmission;
use App\Entity\Store;
use App\Entity\User;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Twig\Environment;

/**
 * HubSpot-style transactional mail with two brand modes:
 *
 * - Platform (signup, SSO welcome, store approve/reject): LGS Card Vault logo +
 *   navy/gold brand colors. Never uses a store palette.
 * - Store (order updates, etc.): that store's logo, primary, and accent colors,
 *   with a "Powered by LGS Card Vault" footer.
 */
final class TransactionalMailer
{
    /** Light-theme LGS tokens (matches frontend/src/index.css + brandingTypes). */
    private const PLATFORM_HEADER = '#0a1627';
    private const PLATFORM_CTA = '#0a1627';
    private const PLATFORM_ACCENT = '#c6a035';

    private const PLATFORM_LOGO_CID = 'platform-logo';
    private const STORE_LOGO_CID = 'store-logo';

    public function __construct(
        private readonly MailerInterface $mailer,
        private readonly Environment $twig,
        #[Autowire('%kernel.project_dir%')]
        private readonly string $projectDir,
    ) {
    }

    /**
     * @param array<string, mixed> $context Template vars (merged with brand context)
     * @param Store|null           $store   Pass only for store-branded mail. Platform mail must omit this.
     */
    public function sendHtml(
        string $to,
        string $subject,
        string $htmlTemplate,
        array $context = [],
        ?string $textBody = null,
        ?Store $store = null,
    ): void {
        $email = (new Email())
            ->from($this->fromAddress($store))
            ->to($to)
            ->subject($subject);

        $brand = null === $store
            ? $this->platformBrandContext($email)
            : $this->storeBrandContext($store, $email);

        $html = $this->twig->render($htmlTemplate, array_merge($brand, $context, [
            'subject' => $subject,
        ]));
        $email->html($html);

        if (null !== $textBody && '' !== trim($textBody)) {
            $email->text($textBody);
        }

        $this->mailer->send($email);
    }

    /** Platform — account signup / SSO welcome. */
    public function sendWelcome(User $user): void
    {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $isOwner = in_array('ROLE_STORE_OWNER', $user->getRoles(), true);
        $frontend = $this->frontendUrl();
        $ctaUrl = $isOwner ? $frontend.'/register/owner' : $frontend.'/';
        $ctaLabel = $isOwner ? 'Continue store setup' : 'Browse stores';
        $name = $user->getDisplayName() ?: 'there';

        $this->sendHtml(
            to: $email,
            subject: 'Welcome to LGS Card Vault',
            htmlTemplate: 'emails/platform/welcome.html.twig',
            context: [
                'preheader' => 'Your account is ready. Shop local game stores in one place.',
                'displayName' => $name,
                'isOwner' => $isOwner,
                'ctaUrl' => $ctaUrl,
                'ctaLabel' => $ctaLabel,
                'frontendUrl' => $frontend,
                'footerNote' => "You're receiving this because you created an account on LGS Card Vault.",
            ],
            textBody: sprintf(
                "Welcome to LGS Card Vault, %s!\n\nYour account is ready.\n%s\n\n%s\n",
                $name,
                $isOwner ? "Continue store setup when you're ready." : 'Browse live stores and build your want list.',
                $ctaUrl,
            ),
            store: null,
        );
    }

    /** Platform — confirm a new email+password signup. */
    public function sendEmailVerification(User $user, string $rawToken, string $otp = ''): void
    {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $name = $user->getDisplayName() ?: 'there';
        $verifyUrl = $this->frontendUrl().'/verify-email?token='.rawurlencode($rawToken);
        $code = preg_replace('/\D+/', '', $otp) ?? '';

        $this->sendHtml(
            to: $email,
            subject: 'Confirm your LGS Card Vault email',
            htmlTemplate: 'emails/platform/email_verification.html.twig',
            context: [
                'preheader' => '' !== $code
                    ? 'Your verification code is '.$code.'. It expires in 24 hours.'
                    : 'Confirm your email to finish creating your account. This link expires in 24 hours.',
                'displayName' => $name,
                'verifyUrl' => $verifyUrl,
                'otp' => $code,
                'footerNote' => "You're receiving this because an LGS Card Vault account was created with this address.",
            ],
            textBody: sprintf(
                "Hi %s,\n\nYour LGS Card Vault verification code: %s\n\nOr confirm with this link (expires in 24 hours):\n%s\n",
                $name,
                '' !== $code ? $code : '(see the link below)',
                $verifyUrl,
            ),
            store: null,
        );
    }

    /** Platform — one-time password reset link. */
    public function sendPasswordReset(User $user, string $rawToken): void
    {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $name = $user->getDisplayName() ?: 'there';
        $resetUrl = $this->frontendUrl().'/reset-password?token='.rawurlencode($rawToken);

        $this->sendHtml(
            to: $email,
            subject: 'Reset your LGS Card Vault password',
            htmlTemplate: 'emails/platform/password_reset.html.twig',
            context: [
                'preheader' => 'Choose a new password. This link expires in one hour.',
                'displayName' => $name,
                'resetUrl' => $resetUrl,
                'footerNote' => "You're receiving this because a password reset was requested for this account.",
            ],
            textBody: sprintf(
                "Hi %s,\n\nReset your LGS Card Vault password (expires in one hour):\n%s\n\nIf you did not ask for this, you can ignore this email.\n",
                $name,
                $resetUrl,
            ),
            store: null,
        );
    }

    /** Platform — marketplace approved the store application. */
    public function sendStoreApproved(Store $store): void
    {
        $to = $store->getOwner()?->getEmail();
        if (null === $to || '' === $to) {
            return;
        }

        $name = $store->getName() ?? 'Your store';
        $storeUrl = $this->frontendUrl().'/s/'.$store->getSlug();
        $adminUrl = $storeUrl.'/admin';

        $this->sendHtml(
            to: $to,
            subject: sprintf('%s is approved and live', $name),
            htmlTemplate: 'emails/platform/store_approved.html.twig',
            context: [
                'preheader' => sprintf('%s is live on the LGS Card Vault marketplace.', $name),
                'storeName' => $name,
                'storeUrl' => $storeUrl,
                'adminUrl' => $adminUrl,
                'footerNote' => "You're receiving this because you applied to open a store on LGS Card Vault.",
            ],
            textBody: sprintf(
                "Great news. %s has been approved and is now live.\n\nStorefront: %s\nDashboard: %s\n",
                $name,
                $storeUrl,
                $adminUrl,
            ),
            store: null,
        );
    }

    /** Platform — marketplace rejected the store application. */
    public function sendStoreRejected(Store $store, ?string $reason): void
    {
        $to = $store->getOwner()?->getEmail();
        if (null === $to || '' === $to) {
            return;
        }

        $name = $store->getName() ?? 'Your store';
        $reasonLine = null !== $reason && '' !== trim($reason)
            ? 'Reviewer notes: '.$reason
            : 'Please review your details and reach out if you have questions.';

        $this->sendHtml(
            to: $to,
            subject: sprintf('Update on your store application: %s', $name),
            htmlTemplate: 'emails/platform/store_rejected.html.twig',
            context: [
                'preheader' => sprintf('An update on your %s application.', $name),
                'storeName' => $name,
                'reasonLine' => $reasonLine,
                'ctaUrl' => $this->frontendUrl().'/',
                'footerNote' => "You're receiving this because you applied to open a store on LGS Card Vault.",
            ],
            textBody: sprintf("Thanks for applying with %s.\n\n%s\n", $name, $reasonLine),
            store: null,
        );
    }

    /** Store-branded — owner added this person as staff. */
    public function sendStaffInvite(Store $store, User $user, bool $newAccount): void
    {
        $to = $user->getEmail();
        if (null === $to || '' === $to) {
            return;
        }

        $storeName = $store->getName() ?? 'the store';
        $adminUrl = $this->frontendUrl().'/s/'.$store->getSlug().'/admin';
        $loginUrl = $this->frontendUrl().'/login';

        $this->sendHtml(
            to: $to,
            subject: sprintf('You were added to %s', $storeName),
            htmlTemplate: 'emails/store/staff_invite.html.twig',
            context: [
                'preheader' => sprintf('%s added you as a store user.', $storeName),
                'displayName' => $user->getDisplayName() ?: 'there',
                'storeName' => $storeName,
                'newAccount' => $newAccount,
                'adminUrl' => $adminUrl,
                'loginUrl' => $loginUrl,
                'footerNote' => sprintf("You're receiving this because %s added you as a store user.", $storeName),
            ],
            textBody: sprintf(
                "Hi %s,\n\n%s added you as a store user.\n\n%s\nSign in: %s\nDashboard: %s\n",
                $user->getDisplayName() ?: 'there',
                $storeName,
                $newAccount
                    ? 'Sign in with the email and password your manager set, or with Google using this email.'
                    : 'Use your existing LGS Card Vault sign-in.',
                $loginUrl,
                $adminUrl,
            ),
            store: $store,
        );
    }

    /** Store-branded — fulfillment notice from the selling store. */
    public function sendOrderFulfilled(\App\Entity\Order $order, User $user, Store $store): void
    {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $storeName = $store->getName() ?? 'Store';
        $ref = $order->getReference() ?? (string) $order->getId();
        $total = number_format($order->getTotalCents() / 100, 2);
        $orderUrl = $this->frontendUrl().'/s/'.$store->getSlug().'/account';
        $customerName = $user->getDisplayName() ?: 'there';

        $this->sendHtml(
            to: $email,
            subject: sprintf('Ready for pickup: %s', $ref),
            htmlTemplate: 'emails/store/order_fulfilled.html.twig',
            context: [
                'preheader' => sprintf('Your order %s from %s is ready for pickup.', $ref, $storeName),
                'customerName' => $customerName,
                'storeName' => $storeName,
                'orderReference' => $ref,
                'totalFormatted' => $total,
                'orderUrl' => $orderUrl,
                'footerNote' => sprintf('Order updates from %s.', $storeName),
            ],
            textBody: sprintf(
                "Your order %s from %s is ready for pickup.\n\nTotal: $%s\nView: %s\n",
                $ref,
                $storeName,
                $total,
                $orderUrl,
            ),
            store: $store,
        );
    }

    /** Store-branded — staff accepted the shopper's sell/trade offer. */
    public function sendSellTradeAccepted(SellSubmission $submission, User $user, Store $store): void
    {
        $this->sendSellTradeDecision(
            $submission,
            $user,
            $store,
            accepted: true,
        );
    }

    /** Store-branded — staff declined the shopper's sell/trade offer. */
    public function sendSellTradeDeclined(SellSubmission $submission, User $user, Store $store): void
    {
        $this->sendSellTradeDecision(
            $submission,
            $user,
            $store,
            accepted: false,
        );
    }

    private function sendSellTradeDecision(
        SellSubmission $submission,
        User $user,
        Store $store,
        bool $accepted,
    ): void {
        $email = $user->getEmail();
        if (null === $email || '' === $email) {
            return;
        }

        $storeName = $store->getName() ?? 'Store';
        $customerName = $user->getDisplayName() ?: 'there';
        $total = number_format($submission->getTotalOfferCents() / 100, 2);
        $accountUrl = $this->frontendUrl().'/account?section=selltrade&store='.$store->getSlug();
        $payoutLabel = SellSubmission::PAYOUT_CREDIT === $submission->getPayoutMethod()
            ? 'Store credit'
            : 'Cash';
        $ref = null !== $submission->getId() ? sprintf('#%d', $submission->getId()) : '';

        if ($accepted) {
            $subject = sprintf('%s accepted your sell/trade', $storeName);
            $preheader = sprintf('%s accepted your sell/trade for $%s.', $storeName, $total);
            $textBody = sprintf(
                "%s accepted your sell/trade%s.\n\nOffer: $%s (%s)\nView: %s\n",
                $storeName,
                '' !== $ref ? ' '.$ref : '',
                $total,
                strtolower($payoutLabel),
                $accountUrl,
            );
            $template = 'emails/store/sell_trade_accepted.html.twig';
        } else {
            $subject = sprintf('Update on your sell/trade at %s', $storeName);
            $preheader = sprintf('%s declined your sell/trade.', $storeName);
            $textBody = sprintf(
                "%s declined your sell/trade%s.\n\nOriginal offer: $%s\nView: %s\n",
                $storeName,
                '' !== $ref ? ' '.$ref : '',
                $total,
                $accountUrl,
            );
            $template = 'emails/store/sell_trade_declined.html.twig';
        }

        $this->sendHtml(
            to: $email,
            subject: $subject,
            htmlTemplate: $template,
            context: [
                'preheader' => $preheader,
                'customerName' => $customerName,
                'storeName' => $storeName,
                'totalFormatted' => $total,
                'payoutLabel' => $payoutLabel,
                'accountUrl' => $accountUrl,
                'footerNote' => sprintf('Sell/trade updates from %s.', $storeName),
            ],
            textBody: $textBody,
            store: $store,
        );
    }

    /** @return array<string, mixed> */
    private function platformBrandContext(Email $email): array
    {
        return [
            'brandKind' => 'platform',
            'brandName' => 'LGS Card Vault',
            'headerColor' => self::PLATFORM_HEADER,
            'ctaColor' => self::PLATFORM_CTA,
            'accentColor' => self::PLATFORM_ACCENT,
            'logoUrl' => $this->platformLogoUrl($email),
            'showBrandName' => false,
            'poweredBy' => false,
        ];
    }

    /** @return array<string, mixed> */
    private function storeBrandContext(Store $store, Email $email): array
    {
        $primary = $this->safeHex($store->getPrimaryColor()) ?? self::PLATFORM_HEADER;
        $accent = $this->safeHex($store->getAccentColor()) ?? $primary;

        return [
            'brandKind' => 'store',
            'brandName' => $store->getName() ?? 'Store',
            'headerColor' => $primary,
            'ctaColor' => $primary,
            'accentColor' => $accent,
            'logoUrl' => $this->storeLogoUrl($store, $email),
            'showBrandName' => true,
            'poweredBy' => true,
        ];
    }

    private function platformLogoUrl(Email $email): string
    {
        foreach ([
            $this->projectDir.'/../frontend/public/brand/logo-dark.png',
            $this->projectDir.'/public/brand/logo-dark.png',
        ] as $path) {
            if (is_file($path)) {
                $email->embedFromPath($path, self::PLATFORM_LOGO_CID, 'image/png');

                return 'cid:'.self::PLATFORM_LOGO_CID;
            }
        }

        return $this->frontendUrl().'/brand/logo-dark.png';
    }

    private function storeLogoUrl(Store $store, Email $email): ?string
    {
        $url = $store->getLogoUrl();
        if (null === $url || '' === trim($url)) {
            return null;
        }
        $url = trim($url);

        if (str_starts_with($url, '/uploads/')) {
            $path = $this->projectDir.'/public'.$url;
            if (is_file($path)) {
                $email->embedFromPath($path, self::STORE_LOGO_CID, $this->imageMime($path));

                return 'cid:'.self::STORE_LOGO_CID;
            }
        }

        if (str_starts_with($url, '/brand/')) {
            foreach ([
                $this->projectDir.'/../frontend/public'.$url,
                $this->projectDir.'/public'.$url,
            ] as $path) {
                if (is_file($path)) {
                    $email->embedFromPath($path, self::STORE_LOGO_CID, $this->imageMime($path));

                    return 'cid:'.self::STORE_LOGO_CID;
                }
            }
        }

        return $this->absoluteAssetUrl($url);
    }

    private function imageMime(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'jpg', 'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            default => 'image/png',
        };
    }

    private function fromAddress(?Store $store): Address
    {
        $raw = trim((string) ($_ENV['APP_MAIL_FROM'] ?? $_SERVER['APP_MAIL_FROM'] ?? ''));
        if ('' === $raw) {
            $raw = 'LGS Card Vault <no-reply@marketplace.local>';
        }

        if (preg_match('/^(.+?)\s*<([^>]+)>$/', $raw, $m)) {
            $name = null !== $store && $store->getName()
                ? sprintf('%s via LGS Card Vault', $store->getName())
                : trim($m[1], " \t\"'");

            return new Address(trim($m[2]), $name);
        }

        $name = null !== $store && $store->getName()
            ? sprintf('%s via LGS Card Vault', $store->getName())
            : 'LGS Card Vault';

        return new Address($raw, $name);
    }

    private function frontendUrl(): string
    {
        $url = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? $_SERVER['APP_FRONTEND_URL'] ?? ''));

        return rtrim('' !== $url ? $url : 'http://localhost:5173', '/');
    }

    private function absoluteAssetUrl(?string $url): ?string
    {
        if (null === $url || '' === trim($url)) {
            return null;
        }
        $url = trim($url);
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return $url;
        }

        return $this->frontendUrl().'/'.ltrim($url, '/');
    }

    private function safeHex(?string $color): ?string
    {
        if (null === $color) {
            return null;
        }
        $color = trim($color);
        if (1 === preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
            return $color;
        }

        return null;
    }
}
