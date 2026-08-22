import { Input, Select } from '../../../components/ui'
import type { GeocodeSuggestion } from '../../../api/types'
import AddressAutocomplete from '../AddressAutocomplete'
import type { OnboardingData, Patch, PatchAddress } from '../types'

const US_STATES: { value: string; label: string }[] = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
]

function toStateCode(region: string): string {
  const trimmed = region.trim()
  const upper = trimmed.toUpperCase()
  if (US_STATES.some((state) => state.value === upper)) return upper
  const byName = US_STATES.find((state) => state.label.toUpperCase() === upper)
  return byName?.value ?? trimmed
}

export function AddressStep({
  data,
  patch,
  patchAddress,
  applyAddress,
}: {
  data: OnboardingData
  patch: Patch
  patchAddress: PatchAddress
  applyAddress: (s: GeocodeSuggestion) => void
}) {
  const a = data.address
  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm text-fg-muted">
        Storefronts must be a physical U.S. location. Shoppers pay online and pick up in store.
      </p>
      <AddressAutocomplete
        onSelect={(suggestion) =>
          applyAddress({
            ...suggestion,
            country: 'US',
            region: toStateCode(suggestion.region),
          })
        }
        country="US"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input label="Address line 1" value={a.addressLine1} onChange={(e) => patchAddress({ addressLine1: e.target.value })} required />
        </div>
        <div className="sm:col-span-2">
          <Input label="Address line 2" hint="Suite, unit, floor (optional)" value={a.addressLine2} onChange={(e) => patchAddress({ addressLine2: e.target.value })} />
        </div>
        <Input label="City" value={a.city} onChange={(e) => patchAddress({ city: e.target.value })} required />
        <Select
          label="State"
          value={a.region}
          onChange={(e) => patchAddress({ region: e.target.value })}
          required
        >
          <option value="">Select state</option>
          {US_STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </Select>
        <Input label="ZIP code" value={a.postalCode} onChange={(e) => patchAddress({ postalCode: e.target.value })} required />
        <Input label="Country" value="United States" disabled />
        <div className="sm:col-span-2">
          <Input label="Business phone" type="tel" autoComplete="tel" value={data.phone} onChange={(e) => patch({ phone: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

export default AddressStep
