<?php

namespace App\Tests\Service\Payments;

use App\Service\Payments\PaypalClient;
use App\Service\Payments\PaypalCredentials;
use App\Service\Payments\PaypalSubscriptionBilling;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class PaypalSubscriptionBillingTest extends TestCase
{
    protected function setUp(): void
    {
        $_ENV['PAYPAL_ENVIRONMENT'] = 'sandbox';
        $_ENV['PAYPAL_SANDBOX_CLIENT_ID'] = 'test-client';
        $_ENV['PAYPAL_SANDBOX_CLIENT_SECRET'] = 'test-secret';
        $_ENV['PAYPAL_CURRENCY'] = 'USD';
        $_SERVER['PAYPAL_ENVIRONMENT'] = 'sandbox';
        $_SERVER['PAYPAL_SANDBOX_CLIENT_ID'] = 'test-client';
        $_SERVER['PAYPAL_SANDBOX_CLIENT_SECRET'] = 'test-secret';
        $_SERVER['PAYPAL_CURRENCY'] = 'USD';
    }

    public function testStartSubscriptionRejectsOrderAmountMismatch(): void
    {
        $http = new MockHttpClient(function (string $method, string $url): MockResponse {
            if (str_contains($url, '/v1/oauth2/token')) {
                return new MockResponse(json_encode([
                    'access_token' => 'tok',
                    'expires_in' => 3600,
                ]));
            }
            if ('GET' === strtoupper($method) && str_contains($url, '/v2/checkout/orders/')) {
                return new MockResponse(json_encode([
                    'id' => 'ORDER1',
                    'purchase_units' => [[
                        'amount' => ['currency_code' => 'USD', 'value' => '0.01'],
                    ]],
                ]));
            }

            self::fail('Should not capture when amounts differ: '.$method.' '.$url);
        });

        $billing = $this->billing($http);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('PayPal order amount does not match this payment');

        $billing->startSubscription('ORDER1', 35_000, ['reference' => 'tedy']);
    }

    public function testStartSubscriptionCapturesWhenAmountMatches(): void
    {
        $http = new MockHttpClient(function (string $method, string $url): MockResponse {
            if (str_contains($url, '/v1/oauth2/token')) {
                return new MockResponse(json_encode([
                    'access_token' => 'tok',
                    'expires_in' => 3600,
                ]));
            }
            if ('GET' === strtoupper($method) && str_contains($url, '/v2/checkout/orders/')) {
                return new MockResponse(json_encode([
                    'id' => 'ORDER1',
                    'purchase_units' => [[
                        'amount' => ['currency_code' => 'USD', 'value' => '350.00'],
                    ]],
                ]));
            }
            if ('POST' === strtoupper($method) && str_contains($url, '/capture')) {
                return new MockResponse(json_encode([
                    'id' => 'ORDER1',
                    'status' => 'COMPLETED',
                    'payer' => ['payer_id' => 'PAYER1'],
                    'purchase_units' => [[
                        'payments' => [
                            'captures' => [[
                                'id' => 'CAP1',
                                'status' => 'COMPLETED',
                                'amount' => ['currency_code' => 'USD', 'value' => '350.00'],
                            ]],
                        ],
                    ]],
                ]));
            }

            self::fail('Unexpected request: '.$method.' '.$url);
        });

        $result = $this->billing($http)->startSubscription('ORDER1', 35_000, ['reference' => 'tedy']);

        self::assertSame('CAP1', $result['reference']);
        self::assertSame(35_000, $result['chargedCents']);
    }

    private function billing(MockHttpClient $http): PaypalSubscriptionBilling
    {
        $credentials = new PaypalCredentials();
        $client = new PaypalClient($http, $credentials);

        return new PaypalSubscriptionBilling($client, $credentials);
    }
}
