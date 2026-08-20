import { ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router'
import type { CatalogGame } from '../../api/types'
import { gameMetaFor, sortGamesForMarketplace } from '../../lib/tcgCatalog'

type TcgCategoryRailProps = {
  games: CatalogGame[]
}

export function TcgCategoryRail({ games }: TcgCategoryRailProps) {
  const reduceMotion = useReducedMotion()
  const ordered = sortGamesForMarketplace(games)

  return (
    <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-4">
        {ordered.map((game, index) => {
          const meta = gameMetaFor(game.code, game.name)
          return (
            <motion.div
              key={game.code}
              initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.32, delay: index * 0.04 }}
              className="min-w-[16rem] flex-1"
            >
              <Link
                to={`/stores`}
                className="group relative flex h-full min-h-[15rem] flex-col overflow-hidden rounded-[1.4rem] border border-white/8 bg-surface/92"
              >
                <img
                  src={meta.image}
                  alt={meta.label}
                  className="absolute inset-0 h-full w-full object-cover opacity-30 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-40"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090b99] to-[#09090b]" />
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${meta.accent}, transparent)` }}
                />
                <div className="relative z-10 flex h-full flex-col justify-end p-5">
                  <div className="space-y-2">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-fg-muted">TCG category</p>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-2xl font-semibold tracking-[-0.04em] text-fg">{meta.shortLabel}</h3>
                      <ArrowUpRight className="size-5 text-fg-muted transition group-hover:text-fg" />
                    </div>
                    <p className="line-clamp-2 text-sm text-fg-muted">{meta.description}</p>
                    <p className="pt-3 text-sm font-medium text-fg">Explore live inventory</p>
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export default TcgCategoryRail
