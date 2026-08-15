<?php

namespace App\Doctrine;

use Doctrine\ORM\Query\AST\Functions\FunctionNode;
use Doctrine\ORM\Query\AST\Node;
use Doctrine\ORM\Query\Parser;
use Doctrine\ORM\Query\SqlWalker;
use Doctrine\ORM\Query\TokenType;

/**
 * DQL CAST_AS_TEXT(field) → PostgreSQL CAST(field AS TEXT).
 *
 * Needed because Postgres json columns cannot LIKE / equal an untyped
 * parameter (`json ~~ unknown`), and stock DQL has no CAST.
 */
final class CastAsTextFunction extends FunctionNode
{
    public Node $expression;

    public function parse(Parser $parser): void
    {
        $parser->match(TokenType::T_IDENTIFIER);
        $parser->match(TokenType::T_OPEN_PARENTHESIS);
        $this->expression = $parser->ArithmeticPrimary();
        $parser->match(TokenType::T_CLOSE_PARENTHESIS);
    }

    public function getSql(SqlWalker $sqlWalker): string
    {
        return 'CAST('.$this->expression->dispatch($sqlWalker).' AS TEXT)';
    }
}
