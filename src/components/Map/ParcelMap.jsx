import React, { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';

import 'leaflet/dist/leaflet.css';

import { parcelGeoJSON, mapCenter } from '../../data/geoJsonData';
import { apiFetch } from '../../api';

/* =========================================================
   LAND USE COLORS
========================================================= */

const LAND_USE_COLORS = {
  Residential: '#60a5fa',
  Commercial: '#fbbf24',
  Agricultural: '#34d399',
  Industrial: '#a78bfa',
  'Public / Institutional': '#f87171',
};

/* =========================================================
   ZONING COLORS
========================================================= */

const ZONING_COLORS = {
  'R1 - Residential Zone': '#bfdbfe',
  'C1 - Commercial Zone': '#fef08a',
  'A1 - Agricultural Zone': '#a7f3d0',
  'I1 - Industrial Zone': '#ddd6fe',
  'P1 - Public Zone': '#fecaca',
};

/* =========================================================
   CONVERT BACKEND LOCATION TO LEAFLET COORDINATES
=========================================================

   Leaflet expects:

   [latitude, longitude]

   Backend may return:

   latitude / longitude

   OR

   lat / lng

   OR

   coordinates: [longitude, latitude]

   OR

   geometry: {
      type: "Point",
      coordinates: [longitude, latitude]
   }

========================================================= */

const getCoordinatesFromParcel = (parcel) => {
  if (!parcel) {
    return null;
  }

  /* -------------------------------------------------------
     Direct latitude / longitude
  ------------------------------------------------------- */

  const latitude = Number(
    parcel.latitude ??
      parcel.lat ??
      parcel.location?.latitude ??
      parcel.location?.lat
  );

  const longitude = Number(
    parcel.longitude ??
      parcel.lng ??
      parcel.lon ??
      parcel.location?.longitude ??
      parcel.location?.lng ??
      parcel.location?.lon
  );

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  ) {
    return [latitude, longitude];
  }

  /* -------------------------------------------------------
     coordinates: [longitude, latitude]
  ------------------------------------------------------- */

  if (
    Array.isArray(parcel.coordinates) &&
    parcel.coordinates.length >= 2
  ) {
    const lng = Number(parcel.coordinates[0]);
    const lat = Number(parcel.coordinates[1]);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return [lat, lng];
    }
  }

  /* -------------------------------------------------------
     geometry
  ------------------------------------------------------- */

  if (parcel.geometry?.coordinates) {
    const coordinates = parcel.geometry.coordinates;

    /* Point */

    if (
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number'
    ) {
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        return [lat, lng];
      }
    }

    /* Polygon */

    try {
      const firstPoint = coordinates?.[0]?.[0];

      if (
        Array.isArray(firstPoint) &&
        firstPoint.length >= 2
      ) {
        const lng = Number(firstPoint[0]);
        const lat = Number(firstPoint[1]);

        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= -90 &&
          lat <= 90 &&
          lng >= -180 &&
          lng <= 180
        ) {
          return [lat, lng];
        }
      }
    } catch (error) {
      console.warn(
        'Unable to read parcel geometry:',
        error
      );
    }
  }

  return null;
};

/* =========================================================
   FIND CENTER OF LOCAL GEOJSON PARCEL
========================================================= */

const getGeoJsonCenter = (selectedUlpin) => {
  if (
    !selectedUlpin ||
    !parcelGeoJSON?.features
  ) {
    return null;
  }

  const feature =
    parcelGeoJSON.features.find(
      (item) =>
        item.properties?.ulpin === selectedUlpin
    );

  if (
    !feature ||
    !feature.geometry ||
    !feature.geometry.coordinates
  ) {
    return null;
  }

  const coords =
    feature.geometry.coordinates[0];

  if (!Array.isArray(coords) || !coords.length) {
    return null;
  }

  let latSum = 0;
  let lngSum = 0;
  let validPoints = 0;

  coords.forEach((coord) => {
    if (
      !Array.isArray(coord) ||
      coord.length < 2
    ) {
      return;
    }

    const lng = Number(coord[0]);
    const lat = Number(coord[1]);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      latSum += lat;
      lngSum += lng;
      validPoints += 1;
    }
  });

  if (!validPoints) {
    return null;
  }

  return [
    latSum / validPoints,
    lngSum / validPoints,
  ];
};

/* =========================================================
   MAP CONTROLLER
========================================================= */

const MapController = ({
  selectedUlpin,
  parcelCoordinates,
}) => {
  const map = useMap();

  useEffect(() => {
    if (!selectedUlpin) {
      return;
    }

    /* -----------------------------------------------
       First priority:
       Coordinates returned by backend
    ------------------------------------------------ */

    if (parcelCoordinates) {
      console.log(
        '🗺️ Moving map to backend location:',
        parcelCoordinates
      );

      map.flyTo(
        parcelCoordinates,
        18,
        {
          duration: 1,
        }
      );

      return;
    }

    /* -----------------------------------------------
       Fallback:
       Local GeoJSON
    ------------------------------------------------ */

    const localCenter =
      getGeoJsonCenter(selectedUlpin);

    if (localCenter) {
      console.log(
        '🗺️ Using local GeoJSON location:',
        localCenter
      );

      map.flyTo(
        localCenter,
        18,
        {
          duration: 1,
        }
      );

      return;
    }

    console.warn(
      '⚠️ No coordinates found for:',
      selectedUlpin
    );
  }, [
    selectedUlpin,
    parcelCoordinates,
    map,
  ]);

  return null;
};

/* =========================================================
   PARCEL MAP
========================================================= */

const ParcelMap = ({
  selectedUlpin,
  onSelectParcel,
  activeLayer = 'landUse',
}) => {
  const geoJsonRef = useRef(null);

  const [
    selectedParcel,
    setSelectedParcel,
  ] = useState(null);

  const [
    parcelCoordinates,
    setParcelCoordinates,
  ] = useState(null);

  const [
    loadingParcel,
    setLoadingParcel,
  ] = useState(false);

  const [
    parcelError,
    setParcelError,
  ] = useState(null);

  /* =======================================================
     LOAD PARCEL FROM BACKEND
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadParcel = async () => {
      if (!selectedUlpin) {
        setSelectedParcel(null);
        setParcelCoordinates(null);
        setParcelError(null);
        return;
      }

      setLoadingParcel(true);
      setParcelError(null);

      try {
        console.log(
          '🔎 Requesting parcel:',
          selectedUlpin
        );

        const result = await apiFetch(
          `/parcels/${encodeURIComponent(
            selectedUlpin
          )}`
        );

        console.log(
          '📦 Parcel API response:',
          result
        );

        if (cancelled) {
          return;
        }

        /* ---------------------------------------------
           Support different response structures
        --------------------------------------------- */

        const parcel =
          result?.data?.parcel ||
          result?.parcel ||
          result?.data ||
          null;

        if (!parcel) {
          throw new Error(
            'Backend returned no parcel data.'
          );
        }

        setSelectedParcel(parcel);

        /* ---------------------------------------------
           Extract coordinates
        --------------------------------------------- */

        const coordinates =
          getCoordinatesFromParcel(parcel);

        if (coordinates) {
          console.log(
            '📍 Parcel coordinates:',
            coordinates
          );

          setParcelCoordinates(
            coordinates
          );
        } else {
          console.warn(
            '⚠️ Parcel found, but no latitude/longitude or geometry was returned.',
            parcel
          );

          setParcelCoordinates(null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error(
          '❌ Parcel request failed:',
          error
        );

        setSelectedParcel(null);
        setParcelCoordinates(null);

        setParcelError(
          error?.message ||
            'Unable to load parcel.'
        );
      } finally {
        if (!cancelled) {
          setLoadingParcel(false);
        }
      }
    };

    loadParcel();

    return () => {
      cancelled = true;
    };
  }, [selectedUlpin]);

  /* =======================================================
     FEATURE STYLE
  ======================================================= */

  const getFeatureStyle = (feature) => {
    const properties =
      feature?.properties || {};

    const isSelected =
      properties.ulpin === selectedUlpin;

    const isAlert =
      properties.status === 'alert';

    let fillColor = '#e5e7eb';

    /* Cadastral */

    if (activeLayer === 'cadastral') {
      fillColor = isAlert
        ? '#f59e0b'
        : '#e5e7eb';
    }

    /* Land use */

    if (activeLayer === 'landUse') {
      const landUse =
        properties.landUse ||
        properties.landuse;

      if (
        landUse &&
        LAND_USE_COLORS[landUse]
      ) {
        fillColor =
          LAND_USE_COLORS[landUse];
      }
    }

    /* Zoning */

    if (activeLayer === 'zoning') {
      const zoning =
        properties.zoning;

      if (
        zoning &&
        ZONING_COLORS[zoning]
      ) {
        fillColor =
          ZONING_COLORS[zoning];
      }
    }

    return {
      fillColor: isSelected
        ? '#2563eb'
        : fillColor,

      weight: isSelected
        ? 3
        : 1,

      opacity: 1,

      color: isSelected
        ? '#1e40af'
        : '#9ca3af',

      fillOpacity: isSelected
        ? 0.8
        : 0.5,
    };
  };

  /* =======================================================
     UPDATE GEOJSON STYLES
  ======================================================= */

  useEffect(() => {
    if (!geoJsonRef.current) {
      return;
    }

    geoJsonRef.current.eachLayer(
      (layer) => {
        if (!layer.feature) {
          return;
        }

        layer.setStyle(
          getFeatureStyle(
            layer.feature
          )
        );
      }
    );
  }, [
    activeLayer,
    selectedUlpin,
  ]);

  /* =======================================================
     GEOJSON EVENTS
  ======================================================= */

  const onEachFeature = (
    feature,
    layer
  ) => {
    const properties =
      feature.properties || {};

    const ulpin =
      properties.ulpin ||
      'Unknown ULPIN';

    const plotNumber =
      properties.plotNumber ||
      'N/A';

    const status =
      properties.status === 'alert'
        ? 'Requires Verification'
        : 'Verified';

    const tooltipContent = `
      <div
        style="
          font-family: Inter, sans-serif;
          line-height: 1.5;
        "
      >
        <b>${ulpin}</b>
        <br />
        Plot: ${plotNumber}
        <br />
        Status: ${status}
      </div>
    `;

    layer.bindTooltip(
      tooltipContent,
      {
        className:
          'custom-tooltip',
      }
    );

    layer.on({
      click: () => {
        if (!properties.ulpin) {
          return;
        }

        console.log(
          '🖱️ Parcel clicked:',
          properties.ulpin
        );

        onSelectParcel(
          properties.ulpin
        );
      },
    });
  };

  /* =======================================================
     MAP
  ======================================================= */

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      <MapContainer
        center={mapCenter}
        zoom={16}
        style={{
          height: '100%',
          width: '100%',
        }}
        zoomControl={true}
      >
        <MapController
          selectedUlpin={selectedUlpin}
          parcelCoordinates={
            parcelCoordinates
          }
        />

        {/* OpenStreetMap */}

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Local parcel polygons */}

        <GeoJSON
          ref={geoJsonRef}
          data={parcelGeoJSON}
          style={(feature) =>
            getFeatureStyle(
              feature
            )
          }
          onEachFeature={
            onEachFeature
          }
        />

        {/* Backend parcel marker */}

        {parcelCoordinates &&
          selectedParcel && (
            <Marker
              position={
                parcelCoordinates
              }
            >
              <Popup>
                <div
                  style={{
                    minWidth:
                      '200px',
                    lineHeight:
                      '1.6',
                  }}
                >
                  <strong>
                    {selectedParcel.ulpin ||
                      selectedUlpin}
                  </strong>

                  <br />

                  Plot:{' '}
                  {selectedParcel.plotNumber ||
                    'N/A'}

                  <br />

                  Area:{' '}
                  {selectedParcel.area ||
                    'N/A'}{' '}
                  {selectedParcel.areaUnit ||
                    'sqm'}

                  <br />

                  Location:{' '}
                  {selectedParcel.location ||
                    'N/A'}

                  <br />

                  Land Use:{' '}
                  {selectedParcel.landUse ||
                    'N/A'}

                  <br />

                  Status:{' '}
                  {selectedParcel.status ||
                    'N/A'}
                </div>
              </Popup>
            </Marker>
          )}
      </MapContainer>

      {/* ===================================================
          LOADING MESSAGE
      =================================================== */}

      {loadingParcel &&
        selectedUlpin && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 1000,
              background: '#ffffff',
              padding:
                '10px 14px',
              borderRadius: '8px',
              boxShadow:
                '0 2px 10px rgba(0,0,0,0.15)',
              fontSize: '13px',
            }}
          >
            🔎 Loading parcel...
          </div>
        )}

      {/* ===================================================
          ERROR MESSAGE
      =================================================== */}

      {parcelError &&
        selectedUlpin && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              right: '12px',
              zIndex: 1000,
              background: '#fee2e2',
              color: '#991b1b',
              padding:
                '10px 14px',
              borderRadius: '8px',
              boxShadow:
                '0 2px 10px rgba(0,0,0,0.12)',
              fontSize: '13px',
            }}
          >
            <strong>
              Unable to load parcel
            </strong>

            <div
              style={{
                marginTop: '4px',
              }}
            >
              {parcelError}
            </div>
          </div>
        )}

      {/* ===================================================
          PARCEL FOUND BUT NO COORDINATES
      =================================================== */}

      {selectedParcel &&
        selectedUlpin &&
        !parcelCoordinates &&
        !loadingParcel &&
        !parcelError && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              right: '12px',
              zIndex: 1000,
              background: '#fff7ed',
              color: '#9a3412',
              padding:
                '10px 14px',
              borderRadius: '8px',
              boxShadow:
                '0 2px 10px rgba(0,0,0,0.12)',
              fontSize: '13px',
            }}
          >
            <strong>
              Parcel found, but location
              data is missing.
            </strong>

            <div
              style={{
                marginTop: '4px',
              }}
            >
              The backend returned the
              parcel information but did
              not return latitude,
              longitude, or polygon
              geometry.
            </div>
          </div>
        )}
    </div>
  );
};

export default ParcelMap;