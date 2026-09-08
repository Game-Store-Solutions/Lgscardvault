<?php

namespace App\EventSubscriber;

use App\Repository\StoreRepository;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * ApiPlatform omits some Store booleans/arrays from GET /stores/{slug}.
 * Patch in listing, feature flags, hero layout, and community events so the
 * storefront and admin settings see the same values the settings PATCH already returns.
 */
#[AsEventListener(event: KernelEvents::RESPONSE, priority: -16)]
final readonly class StoreListingJsonSubscriber
{
    public function __construct(private StoreRepository $stores)
    {
    }

    public function __invoke(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();
        if ('GET' !== $request->getMethod()) {
            return;
        }

        if (1 !== preg_match('#^/api/stores/([a-z0-9-]+)$#', $request->getPathInfo(), $matches)) {
            return;
        }

        $response = $event->getResponse();
        if ($response->getStatusCode() >= Response::HTTP_BAD_REQUEST) {
            return;
        }

        $payload = json_decode((string) $response->getContent(), true);
        if (!is_array($payload)) {
            return;
        }

        $store = $this->stores->findOneBySlug($matches[1]);
        if (null === $store) {
            return;
        }

        $payload['isListed'] = $store->isListed();
        $payload['features'] = $store->getFeatures();
        $payload['communityEvents'] = $store->getCommunityEvents();
        $payload['heroLayout'] = $store->getHeroLayout();

        $response->setContent(json_encode($payload, JSON_THROW_ON_ERROR));
        if ($response instanceof JsonResponse) {
            $response->headers->set('Content-Type', $response->headers->get('Content-Type') ?: 'application/json');
        }
    }
}
