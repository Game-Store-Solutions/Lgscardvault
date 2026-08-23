<?php

namespace App\Tests\Service;

use App\Entity\PrivacyRequest;
use PHPUnit\Framework\TestCase;

final class PrivacyRequestSlaTest extends TestCase
{
    public function testDueDateIsFortyFiveDaysAndOpenRequestIsNotOverdueYet(): void
    {
        $row = new PrivacyRequest(PrivacyRequest::TYPE_ACCESS, 'a@example.com', 'Ada');
        $now = $row->getCreatedAt()->modify('+10 days');

        self::assertTrue($row->isOpen());
        self::assertFalse($row->isOverdue($now));
        self::assertSame(35, $row->daysRemaining($now));
        self::assertSame(45, (int) $row->getCreatedAt()->diff($row->dueAt())->days);
    }

    public function testOpenRequestIsOverdueAfterSla(): void
    {
        $row = new PrivacyRequest(PrivacyRequest::TYPE_TAKEDOWN, 'rights@example.com', 'WotC');
        $now = $row->getCreatedAt()->modify('+46 days');

        self::assertTrue($row->isOverdue($now));
        self::assertLessThan(0, $row->daysRemaining($now));
    }

    public function testCompletedRequestIsNotOverdue(): void
    {
        $row = new PrivacyRequest(PrivacyRequest::TYPE_DELETE, 'b@example.com', 'Bea');
        $row->setStatus(PrivacyRequest::STATUS_COMPLETED);
        $now = $row->getCreatedAt()->modify('+60 days');

        self::assertFalse($row->isOpen());
        self::assertFalse($row->isOverdue($now));
    }
}
