<?php

namespace App\Controller;

use App\Repository\StoreRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/** Dynamic sitemap including active storefront URLs for search engines. */
final class PublicSitemapController extends AbstractController
{
    /**
     * @return list<array{path: string, changefreq: string, priority: string}>
     */
    private function staticPaths(): array
    {
        return [
            ['path' => '/', 'changefreq' => 'daily', 'priority' => '1.0'],
            ['path' => '/stores', 'changefreq' => 'daily', 'priority' => '0.9'],
            ['path' => '/tools/deck-builder', 'changefreq' => 'weekly', 'priority' => '0.9'],
            ['path' => '/pricing', 'changefreq' => 'weekly', 'priority' => '0.8'],
            ['path' => '/register/customer', 'changefreq' => 'monthly', 'priority' => '0.5'],
            ['path' => '/register/owner', 'changefreq' => 'monthly', 'priority' => '0.5'],
            ['path' => '/privacy', 'changefreq' => 'yearly', 'priority' => '0.3'],
            ['path' => '/terms', 'changefreq' => 'yearly', 'priority' => '0.3'],
        ];
    }

    #[Route('/sitemap.xml', name: 'public_sitemap', methods: ['GET'])]
    public function sitemap(StoreRepository $stores): Response
    {
        $base = rtrim($this->frontendUrl(), '/');
        $entries = [];

        foreach ($this->staticPaths() as $row) {
            $entries[] = [
                'loc' => $base.$row['path'],
                'changefreq' => $row['changefreq'],
                'priority' => $row['priority'],
            ];
        }

        foreach ($stores->findActiveStores() as $store) {
            $slug = $store->getSlug();
            if (null === $slug || '' === trim($slug)) {
                continue;
            }
            $entries[] = [
                'loc' => $base.'/s/'.rawurlencode($slug),
                'changefreq' => 'daily',
                'priority' => '0.8',
            ];
        }

        $xml = $this->renderView('sitemap/sitemap.xml.twig', ['entries' => $entries]);

        return new Response($xml, Response::HTTP_OK, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    private function frontendUrl(): string
    {
        $url = trim((string) ($_ENV['APP_FRONTEND_URL'] ?? $_SERVER['APP_FRONTEND_URL'] ?? ''));

        return '' !== $url ? $url : 'https://lgscardvault.com';
    }
}
