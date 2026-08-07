import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { artistBrowsePath, decodeArtistParam } from '../lib/artistBrowse'

/** Old `/artists/:encodedName` links → query form so routing never misses a match. */
export default function ArtistLegacyRedirect() {
  const { slug = '', artist = '' } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const game = searchParams.get('game') ?? 'mtg'

  return (
    <Navigate
      to={artistBrowsePath(slug, decodeArtistParam(artist), game)}
      replace
      state={location.state}
    />
  )
}
