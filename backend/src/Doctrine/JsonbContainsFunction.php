<?php

namespace App\Doctrine;

use Doctrine\ORM\Query\AST\Functions\FunctionNode;
use Doctrine\ORM\Query\AST\Node;
use Doctrine\ORM\Query\Parser;
use Doctrine\ORM\Query\SqlWalker;
use Doctrine\ORM\Query\TokenType;

/**
 * DQL JSONB_CONTAINS(field, value) → PostgreSQL field @> CAST(value AS jsonb).
 *
 * Stock DQL has no JSONB containment operator. Artist filters use this so the
 * GIN index on cards.artist_credits can satisfy `@>` instead of a sequential
 * LIKE over the raw Scryfall payload.
 */
final class JsonbContainsFunction extends FunctionNode
{
    public Node $field;
    public Node $value;

    public function parse(Parser $parser): void
    {
        $parser->match(TokenType::T_IDENTIFIER);
        $parser->match(TokenType::T_OPEN_PARENTHESIS);
        $this->field = $parser->ArithmeticPrimary();
        $parser->match(TokenType::T_COMMA);
        $this->value = $parser->ArithmeticPrimary();
        $parser->match(TokenType::T_CLOSE_PARENTHESIS);
    }

    public function getSql(SqlWalker $sqlWalker): string
    {
        return '('.$this->field->dispatch($sqlWalker).') @> CAST('.$this->value->dispatch($sqlWalker).' AS jsonb)';
    }
}
