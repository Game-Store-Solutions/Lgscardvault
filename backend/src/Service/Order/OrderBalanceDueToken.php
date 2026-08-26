<?php

namespace App\Service\Order;

use App\Entity\Order;
use Symfony\Component\DependencyInjection\ParameterBag\ParameterBagInterface;

/** Signed link so guest shoppers can approve a supplemental PayPal charge without an account. */
final readonly class OrderBalanceDueToken
{
    private const PURPOSE = 'order_balance_due';

    public function __construct(private ParameterBagInterface $parameters)
    {
    }

    public function create(Order $order, int $ttlSeconds = 2_592_000): string
    {
        $store = $order->getStore();
        $email = strtolower(trim((string) $order->getCustomerEmail()));
        if ('' === $email || null === $store?->getSlug()) {
            throw new \InvalidArgumentException('This order cannot issue a guest payment link.');
        }

        $payload = [
            'purpose' => self::PURPOSE,
            'orderId' => $order->getId(),
            'storeSlug' => $store->getSlug(),
            'email' => $email,
            'expiresAt' => time() + $ttlSeconds,
            'nonce' => bin2hex(random_bytes(16)),
        ];

        $encodedPayload = $this->base64UrlEncode(json_encode($payload, JSON_THROW_ON_ERROR));

        return $encodedPayload.'.'.$this->sign($encodedPayload);
    }

    public function verify(string $token, Order $order): void
    {
        [$encodedPayload, $signature] = array_pad(explode('.', $token, 2), 2, '');
        if ('' === $encodedPayload || '' === $signature) {
            throw new \InvalidArgumentException('This payment link is invalid.');
        }

        if (!hash_equals($this->sign($encodedPayload), $signature)) {
            throw new \InvalidArgumentException('This payment link is invalid.');
        }

        $payload = json_decode($this->base64UrlDecode($encodedPayload), true, flags: JSON_THROW_ON_ERROR);
        if (!is_array($payload) || time() > (int) ($payload['expiresAt'] ?? 0)) {
            throw new \InvalidArgumentException('This payment link has expired. Ask the store to resend it.');
        }

        if (self::PURPOSE !== ($payload['purpose'] ?? '')) {
            throw new \InvalidArgumentException('This payment link is invalid.');
        }

        $store = $order->getStore();
        $email = strtolower(trim((string) $order->getCustomerEmail()));
        if (
            (int) ($payload['orderId'] ?? 0) !== $order->getId()
            || (string) ($payload['storeSlug'] ?? '') !== (string) ($store?->getSlug() ?? '')
            || (string) ($payload['email'] ?? '') !== $email
        ) {
            throw new \InvalidArgumentException('This payment link does not match this order.');
        }
    }

    private function sign(string $payload): string
    {
        return $this->base64UrlEncode(hash_hmac('sha256', $payload, (string) $this->parameters->get('kernel.secret'), true));
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if (false === $decoded) {
            throw new \InvalidArgumentException('This payment link is invalid.');
        }

        return $decoded;
    }
}
