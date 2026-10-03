import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Partner } from '../shared/partners';
import { officeCatalogSchema, type Office } from '../shared/offices';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const cities: Record<string, [number, number]> = {
  Paris: [48.8566, 2.3522],
  Lyon: [45.764, 4.8357],
  Marseille: [43.2965, 5.3698],
  Bordeaux: [44.8378, -0.5792],
  Lille: [50.6292, 3.0573],
  Nantes: [47.2184, -1.5536],
  Toulouse: [43.6047, 1.4442],
  Strasbourg: [48.5734, 7.7521],
  'Fort-de-France': [14.6161, -61.0588],
  'Saint-Denis (La Réunion)': [-20.8823, 55.4504],
};

export default function PartnerMap({
  partners,
  onSelect,
}: {
  partners: Partner[];
  onSelect: (partner: Partner) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const choose = useRef(onSelect);
  choose.current = onSelect;
  const [city, setCity] = useState('Paris');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [offices, setOffices] = useState<Office[]>([]);
  const [catalogDate, setCatalogDate] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [search, setSearch] = useState('');
  const officeMarkers = useRef(new Map<string, L.CircleMarker>());
  const matching = useMemo(
    () =>
      offices.filter((office) =>
        normalize(`${office.name} ${office.city} ${office.postalCode}`).includes(
          normalize(search.trim()),
        ),
      ),
    [offices, search],
  );
  const visible = matching.filter((office) => bounds?.contains([office.lat, office.lng]));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCatalogError('');
    fetch('/offices.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const catalog = officeCatalogSchema.parse(await response.json());
        setOffices(catalog.offices);
        setCatalogDate(catalog.retrievedAt);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCatalogError(
            'Les localisations sont indisponibles. Réessayez ou consultez l’annuaire officiel.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, {
      scrollWheelZoom: false,
      preferCanvas: true,
    }).setView(cities.Paris, 11);
    map.current = instance;
    const updateBounds = () => setBounds(instance.getBounds());
    instance.on('moveend', updateBounds);
    updateBounds();
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .on('tileerror', () =>
        setError(
          'Le fond de carte est indisponible. La liste et la recherche restent accessibles.',
        ),
      )
      .addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.featureGroup().addTo(instance);
    officeMarkers.current.clear();
    for (const office of matching) {
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = office.name;
      const place = document.createElement('p');
      place.textContent = `${office.postalCode} ${office.city}`;
      const label = document.createElement('p');
      label.textContent = 'Annuaire officiel · partenariat Preuvix non confirmé';
      const profile = document.createElement('a');
      profile.textContent = 'Coordonnées et fiche officielle ↗';
      profile.href = office.directoryUrl;
      profile.target = '_blank';
      profile.rel = 'noopener noreferrer';
      const directions = document.createElement('a');
      directions.textContent = 'Itinéraire ↗';
      directions.href = `https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lng}`;
      directions.target = '_blank';
      directions.rel = 'noopener noreferrer';
      content.append(title, place, label, profile, document.createElement('br'), directions);
      const marker = L.circleMarker([office.lat, office.lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: '#b34c1d',
        fillOpacity: 0.95,
      })
        .bindPopup(content)
        .addTo(group);
      officeMarkers.current.set(office.id, marker);
    }
    return () => {
      group.remove();
      officeMarkers.current.clear();
    };
  }, [matching]);
  function searchMap() {
    const instance = map.current;
    if (!instance || !matching.length) return;
    instance.fitBounds(
      L.latLngBounds(matching.map((office) => [office.lat, office.lng] as [number, number])),
      { padding: [35, 35], maxZoom: 14 },
    );
  }
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.featureGroup().addTo(instance);
    for (const partner of partners) {
      if (!partner.coordinates) continue;
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = partner.name;
      const cityLabel = document.createElement('p');
      cityLabel.textContent = partner.city;
      const button = document.createElement('button');
      button.textContent = 'Préparer une demande';
      button.onclick = () => choose.current(partner);
      content.append(title, cityLabel, button);
      L.marker([partner.coordinates.lat, partner.coordinates.lng], {
        title: partner.name,
        alt: partner.name,
        icon: L.divIcon({
          className: 'partner-map-pin',
          html: '<span>⚖</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        }),
      })
        .bindPopup(content)
        .addTo(group);
    }
    if (group.getLayers().length)
      instance.fitBounds(group.getBounds(), { padding: [45, 45], maxZoom: 13, animate: false });
    return () => {
      group.remove();
    };
  }, [partners]);
  function locate() {
    if (!navigator.geolocation) {
      setError('La géolocalisation est indisponible. Choisissez une ville.');
      return;
    }
    setError('');
    setLocation('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        map.current?.setView([coords.latitude, coords.longitude], 12);
        setLocation('Carte centrée sur votre position.');
      },
      () => {
        setLocation('');
        setError('Position inaccessible. Choisissez une ville ou saisissez votre commune.');
      },
      { timeout: 10000 },
    );
  }
  return (
    <div className="partner-map-shell">
      <div className="partner-map-toolbar">
        <div>
          <span className="welcome-kicker">À PROXIMITÉ DE VOUS</span>
          <h4>Un professionnel, près de chez vous.</h4>
        </div>
        <button className="welcome-button subtle" onClick={locate}>
          Me localiser
        </button>
      </div>
      <label htmlFor="map-city">Explorer une ville</label>
      <select
        id="map-city"
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          setSearch('');
          map.current?.setView(cities[e.target.value], 11);
        }}
      >
        {Object.keys(cities).map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <div
        ref={container}
        className="partner-map"
        role="region"
        aria-label="Carte interactive des commissaires de justice"
      />
      <form
        className="map-search"
        onSubmit={(event) => {
          event.preventDefault();
          searchMap();
        }}
      >
        <label htmlFor="office-search">Rechercher sur la carte : ville, code postal ou étude</label>
        <input
          id="office-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ex. Paris, 69002, nom de l’étude"
          maxLength={100}
        />
        <button className="welcome-button solid" type="submit" disabled={!matching.length}>
          Afficher les résultats
        </button>
      </form>
      {loading && <p role="status">Chargement des études de l’annuaire officiel…</p>}
      {catalogError && (
        <p role="alert">
          {catalogError}{' '}
          <button onClick={() => setAttempt((value) => value + 1)}>
            Réessayer les localisations
          </button>
        </p>
      )}
      {!loading && !catalogError && (
        <>
          <p role="status">
            {visible.length} localisation(s) dans la zone affichée · {matching.length} résultat(s)
            dans le répertoire.
          </p>
          {!matching.length ? (
            <p>Aucune étude trouvée. Essayez une ville ou un code postal différent.</p>
          ) : !visible.length ? (
            <p>Aucune étude dans cette zone. Cliquez sur « Afficher les résultats » ou dézoomez.</p>
          ) : null}
          <div className="office-map-results" aria-label="Études dans la zone affichée">
            {visible.slice(0, 30).map((office) => (
              <button
                key={office.id}
                onClick={() => {
                  map.current?.setView([office.lat, office.lng], 15);
                  officeMarkers.current.get(office.id)?.openPopup();
                  container.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <strong>{office.name}</strong>
                <span>
                  {office.postalCode} · {office.city}
                </span>
                <span>Voir sur la carte ↗</span>
              </button>
            ))}
          </div>
          {visible.length > 30 && (
            <p>
              30 fiches affichées ci-dessous ; tous les résultats restent sur la carte. Zoomez pour
              affiner.
            </p>
          )}
          <small>
            Localisations issues de l’
            <a
              href="https://annuaire.commissaire-justice.fr/"
              target="_blank"
              rel="noopener noreferrer"
            >
              annuaire officiel
            </a>
            , relevées le {catalogDate}. Liste non exhaustive, coordonnées à confirmer auprès de
            l’étude. Ces inscriptions ne constituent pas un partenariat Preuvix.
          </small>
        </>
      )}
      <p>
        {partners.filter((p) => p.coordinates).length} partenaire(s) Preuvix géolocalisé(s) parmi
        les résultats. Seules les adresses renseignées sont placées sur la carte.
      </p>
      {location && <p role="status">{location}</p>}
      {error && <p role="status">{error}</p>}
      <div className="map-search">
        <label htmlFor="map-search">Trouver un commissaire de justice dans votre commune</label>
        <input
          id="map-search"
          placeholder="Ville ou code postal"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
        <a
          className="welcome-button solid"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`commissaire de justice ${search.trim() || city}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Rechercher sur Google Maps ↗
        </a>
      </div>
      <small>
        Les résultats Google Maps sont externes au réseau Preuvix. Vérifiez l’étude dans l’annuaire
        officiel ci-dessous. Fond de carte fourni par OpenStreetMap.
      </small>
    </div>
  );
}
