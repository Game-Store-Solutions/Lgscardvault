import { CampaignHome } from './CampaignHome'
import { StudioHome } from './StudioHome'
import type { StoreHomeLayoutProps } from './types'

function VaultHome({ slots }: StoreHomeLayoutProps) {
  return (
    <div className="storefront-atmosphere relative space-y-6 sm:space-y-10" data-storefront-template="vault">
      {slots.hero}
      {slots.promo}
      {slots.stats}
      <section className="space-y-4 sm:space-y-5">
        {slots.intro}
        {slots.shortcuts}
      </section>
      {slots.games}
      {slots.spotlight}
      {slots.sealed}
      {slots.browse}
      {slots.filtersDrawer}
    </div>
  )
}

export function StoreHomeLayout(props: StoreHomeLayoutProps) {
  if (props.template === 'campaign') return <CampaignHome {...props} />
  if (props.template === 'studio') return <StudioHome {...props} />
  return <VaultHome {...props} />
}
