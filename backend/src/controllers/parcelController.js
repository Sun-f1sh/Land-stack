import prisma from '../config/database.js';

// ─────────────────────────────────────────────────────────────
// Field selections
// ─────────────────────────────────────────────────────────────

/**
 * Ownership fields returned with parcel details.
 */
const ownershipInclude = {
  ownerships: {
    where: { isCurrent: true },
    select: {
      id: true,
      ownerName: true,
      ownershipType: true,
      ownershipStatus: true,
      rorStatus: true,
      verificationStatus: true,
      isCurrent: true,
      acquiredDate: true,
    },
  },
};

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

const VALID_LAND_USES = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'AGRICULTURAL',
  'INDUSTRIAL',
  'PUBLIC_INSTITUTIONAL',
];

const VALID_STATUSES = [
  'VERIFIED',
  'PENDING',
  'DISPUTED',
  'UNDER_REVIEW',
];

const VALID_RISK_STATUSES = [
  'LOW',
  'MEDIUM',
  'HIGH',
];

/**
 * Validate latitude.
 */
const validateLatitude = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return true;
  }

  const latitude = Number(value);

  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90
  );
};

/**
 * Validate longitude.
 */
const validateLongitude = (value) => {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return true;
  }

  const longitude = Number(value);

  return (
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
};

/**
 * Validate parcel input.
 */
const validateParcelInput = (
  body,
  isUpdate = false
) => {
  const errors = [];

  // ─────────────────────────────────────────────
  // Required fields for creation
  // ─────────────────────────────────────────────

  if (!isUpdate) {
    if (
      !body.ulpin ||
      body.ulpin.trim().length === 0
    ) {
      errors.push(
        'ULPIN is required.'
      );
    }

    if (
      !body.plotNumber ||
      body.plotNumber.trim().length === 0
    ) {
      errors.push(
        'Plot number is required.'
      );
    }

    if (
      body.area === undefined ||
      body.area === null ||
      isNaN(Number(body.area)) ||
      Number(body.area) <= 0
    ) {
      errors.push(
        'Area must be a positive number.'
      );
    }

    if (
      !body.location ||
      body.location.trim().length === 0
    ) {
      errors.push(
        'Location is required.'
      );
    }
  }

  // ─────────────────────────────────────────────
  // Land use
  // ─────────────────────────────────────────────

  if (
    body.landUse &&
    !VALID_LAND_USES.includes(
      body.landUse
    )
  ) {
    errors.push(
      `landUse must be one of: ${VALID_LAND_USES.join(
        ', '
      )}`
    );
  }

  // ─────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────

  if (
    body.status &&
    !VALID_STATUSES.includes(
      body.status
    )
  ) {
    errors.push(
      `status must be one of: ${VALID_STATUSES.join(
        ', '
      )}`
    );
  }

  // ─────────────────────────────────────────────
  // Risk status
  // ─────────────────────────────────────────────

  if (
    body.riskStatus &&
    !VALID_RISK_STATUSES.includes(
      body.riskStatus
    )
  ) {
    errors.push(
      `riskStatus must be one of: ${VALID_RISK_STATUSES.join(
        ', '
      )}`
    );
  }

  // ─────────────────────────────────────────────
  // Area
  // ─────────────────────────────────────────────

  if (
    body.area !== undefined &&
    (
      isNaN(Number(body.area)) ||
      Number(body.area) <= 0
    )
  ) {
    errors.push(
      'Area must be a positive number.'
    );
  }

  // ─────────────────────────────────────────────
  // Latitude
  // ─────────────────────────────────────────────

  if (
    !validateLatitude(body.latitude)
  ) {
    errors.push(
      'Latitude must be a number between -90 and 90.'
    );
  }

  // ─────────────────────────────────────────────
  // Longitude
  // ─────────────────────────────────────────────

  if (
    !validateLongitude(body.longitude)
  ) {
    errors.push(
      'Longitude must be a number between -180 and 180.'
    );
  }

  // ─────────────────────────────────────────────
  // Latitude + longitude should be supplied together
  // ─────────────────────────────────────────────

  const hasLatitude =
    body.latitude !== undefined &&
    body.latitude !== null &&
    body.latitude !== '';

  const hasLongitude =
    body.longitude !== undefined &&
    body.longitude !== null &&
    body.longitude !== '';

  if (
    hasLatitude &&
    !hasLongitude
  ) {
    errors.push(
      'Longitude is required when latitude is provided.'
    );
  }

  if (
    hasLongitude &&
    !hasLatitude
  ) {
    errors.push(
      'Latitude is required when longitude is provided.'
    );
  }

  return errors;
};

// ─────────────────────────────────────────────────────────────
// GET /api/parcels/:ulpin
// ─────────────────────────────────────────────────────────────

/**
 * Find a single parcel by ULPIN.
 *
 * Returns:
 * - Parcel information
 * - Latitude
 * - Longitude
 * - Current ownership
 *
 * The frontend map uses latitude/longitude to locate
 * the parcel on Leaflet.
 */
export const getParcelByUlpin = async (
  req,
  res,
  next
) => {
  try {
    const { ulpin } = req.params;

    if (!ulpin) {
      return res.status(400).json({
        success: false,
        message: 'ULPIN is required.',
      });
    }

    const parcel =
      await prisma.parcel.findUnique({
        where: {
          ulpin: ulpin.trim(),
        },
        include: ownershipInclude,
      });

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: `Parcel with ULPIN "${ulpin}" not found.`,
      });
    }

    console.log(
      `📍 Parcel found: ${parcel.ulpin}`,
      {
        latitude: parcel.latitude,
        longitude: parcel.longitude,
      }
    );

    return res.json({
      success: true,
      data: {
        parcel,
      },
    });
  } catch (error) {
    console.error(
      '❌ getParcelByUlpin error:',
      error
    );

    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/parcels
// ─────────────────────────────────────────────────────────────

/**
 * List/search parcels with filters and pagination.
 */
export const listParcels = async (
  req,
  res,
  next
) => {
  try {
    const {
      ulpin,
      location,
      district,
      village,
      landUse,
      status,
      page = '1',
      limit = '20',
    } = req.query;

    // ─────────────────────────────────────────
    // Pagination
    // ─────────────────────────────────────────

    const pageNum = Math.max(
      1,
      parseInt(page, 10) || 1
    );

    const limitNum = Math.min(
      100,
      Math.max(
        1,
        parseInt(limit, 10) || 20
      )
    );

    const skip =
      (pageNum - 1) * limitNum;

    // ─────────────────────────────────────────
    // Filters
    // ─────────────────────────────────────────

    const where = {};

    if (ulpin) {
      where.ulpin = {
        contains: ulpin,
        mode: 'insensitive',
      };
    }

    if (location) {
      where.location = {
        contains: location,
        mode: 'insensitive',
      };
    }

    if (district) {
      where.district = {
        equals: district,
        mode: 'insensitive',
      };
    }

    if (village) {
      where.village = {
        equals: village,
        mode: 'insensitive',
      };
    }

    if (
      landUse &&
      VALID_LAND_USES.includes(
        landUse
      )
    ) {
      where.landUse = landUse;
    }

    if (
      status &&
      VALID_STATUSES.includes(
        status
      )
    ) {
      where.status = status;
    }

    // ─────────────────────────────────────────
    // Database query
    // ─────────────────────────────────────────

    const [
      parcels,
      total,
    ] = await Promise.all([
      prisma.parcel.findMany({
        where,

        include: ownershipInclude,

        orderBy: {
          createdAt: 'desc',
        },

        skip,

        take: limitNum,
      }),

      prisma.parcel.count({
        where,
      }),
    ]);

    return res.json({
      success: true,

      data: {
        parcels,

        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages:
            Math.ceil(
              total / limitNum
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      '❌ listParcels error:',
      error
    );

    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/parcels
// ─────────────────────────────────────────────────────────────

/**
 * Create a new parcel.
 *
 * Requires OFFICER or ADMIN role
 * according to your existing route middleware.
 */
export const createParcel = async (
  req,
  res,
  next
) => {
  try {
    const errors =
      validateParcelInput(
        req.body,
        false
      );

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Validation failed.',
        errors,
      });
    }

    // ─────────────────────────────────────────
    // Check ULPIN uniqueness
    // ─────────────────────────────────────────

    const existing =
      await prisma.parcel.findUnique({
        where: {
          ulpin:
            req.body.ulpin.trim(),
        },
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A parcel with ULPIN "${req.body.ulpin}" already exists.`,
      });
    }

    // ─────────────────────────────────────────
    // Create parcel
    // ─────────────────────────────────────────

    const parcel =
      await prisma.parcel.create({
        data: {
          ulpin:
            req.body.ulpin.trim(),

          plotNumber:
            req.body.plotNumber.trim(),

          surveyNo:
            req.body.surveyNo ||
            null,

          gatNumber:
            req.body.gatNumber ||
            null,

          khataNumber:
            req.body.khataNumber ||
            null,

          area:
            parseFloat(
              req.body.area
            ),

          areaUnit:
            req.body.areaUnit ||
            'sqm',

          location:
            req.body.location.trim(),

          village:
            req.body.village ||
            null,

          taluka:
            req.body.taluka ||
            null,

          district:
            req.body.district ||
            null,

          state:
            req.body.state ||
            null,

          // ─────────────────────────────────
          // NEW: Geographic coordinates
          // ─────────────────────────────────

          latitude:
            req.body.latitude !==
              undefined &&
              req.body.latitude !==
              null &&
              req.body.latitude !== ''
              ? parseFloat(
                req.body.latitude
              )
              : null,

          longitude:
            req.body.longitude !==
              undefined &&
              req.body.longitude !==
              null &&
              req.body.longitude !== ''
              ? parseFloat(
                req.body.longitude
              )
              : null,

          // ─────────────────────────────────
          // Existing parcel fields
          // ─────────────────────────────────

          landUse:
            req.body.landUse ||
            'RESIDENTIAL',

          zoning:
            req.body.zoning ||
            null,

          status:
            req.body.status ||
            'PENDING',

          riskStatus:
            req.body.riskStatus ||
            'LOW',

          buildingPermission:
            req.body.buildingPermission ||
            null,

          developmentRestrictions:
            req.body.developmentRestrictions ||
            null,

          propertyTaxStatus:
            req.body.propertyTaxStatus ||
            null,

          outstandingAmount:
            req.body.outstandingAmount ||
            null,

          encumbranceStatus:
            req.body.encumbranceStatus ||
            null,

          mortgage:
            req.body.mortgage ||
            null,

          electricity:
            req.body.electricity ||
            null,

          water:
            req.body.water ||
            null,

          roadAccess:
            req.body.roadAccess ||
            null,

          registrationStatus:
            req.body.registrationStatus ||
            null,

          lastTransactionType:
            req.body.lastTransactionType ||
            null,

          registrationDocumentId:
            req.body.registrationDocumentId ||
            null,

          lastTransactionDate:
            req.body.lastTransactionDate
              ? new Date(
                req.body.lastTransactionDate
              )
              : null,

          lastUpdated:
            new Date(),
        },

        include:
          ownershipInclude,
      });

    console.log(
      '✅ Parcel created:',
      {
        ulpin: parcel.ulpin,
        latitude:
          parcel.latitude,
        longitude:
          parcel.longitude,
      }
    );

    return res.status(201).json({
      success: true,

      message:
        'Parcel created successfully.',

      data: {
        parcel,
      },
    });
  } catch (error) {
    console.error(
      '❌ createParcel error:',
      error
    );

    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/parcels/:id
// ─────────────────────────────────────────────────────────────

/**
 * Update parcel by ID.
 *
 * Requires OFFICER or ADMIN according
 * to your existing route middleware.
 */
export const updateParcel = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const errors =
      validateParcelInput(
        req.body,
        true
      );

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Validation failed.',
        errors,
      });
    }

    // ─────────────────────────────────────────
    // Check parcel exists
    // ─────────────────────────────────────────

    const existing =
      await prisma.parcel.findUnique({
        where: { id },
      });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          'Parcel not found.',
      });
    }

    // ─────────────────────────────────────────
    // Check ULPIN uniqueness
    // ─────────────────────────────────────────

    if (
      req.body.ulpin &&
      req.body.ulpin.trim() !==
      existing.ulpin
    ) {
      const duplicate =
        await prisma.parcel.findUnique({
          where: {
            ulpin:
              req.body.ulpin.trim(),
          },
        });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `A parcel with ULPIN "${req.body.ulpin}" already exists.`,
        });
      }
    }

    // ─────────────────────────────────────────
    // Build update object
    // ─────────────────────────────────────────

    const data = {};

    const stringFields = [
      'ulpin',
      'plotNumber',
      'surveyNo',
      'gatNumber',
      'khataNumber',
      'areaUnit',
      'location',
      'village',
      'taluka',
      'district',
      'state',
      'zoning',
      'buildingPermission',
      'developmentRestrictions',
      'propertyTaxStatus',
      'outstandingAmount',
      'encumbranceStatus',
      'mortgage',
      'electricity',
      'water',
      'roadAccess',
      'registrationStatus',
      'lastTransactionType',
      'registrationDocumentId',
    ];

    for (
      const field of stringFields
    ) {
      if (
        req.body[field] !==
        undefined
      ) {
        data[field] =
          typeof req.body[field] ===
            'string'
            ? req.body[field].trim()
            : req.body[field];
      }
    }

    // ─────────────────────────────────────────
    // Numeric fields
    // ─────────────────────────────────────────

    if (
      req.body.area !==
      undefined
    ) {
      data.area =
        parseFloat(
          req.body.area
        );
    }

    // ─────────────────────────────────────────
    // Geographic coordinates
    // ─────────────────────────────────────────

    if (
      req.body.latitude !==
      undefined
    ) {
      data.latitude =
        req.body.latitude ===
          null ||
          req.body.latitude ===
          ''
          ? null
          : parseFloat(
            req.body.latitude
          );
    }

    if (
      req.body.longitude !==
      undefined
    ) {
      data.longitude =
        req.body.longitude ===
          null ||
          req.body.longitude ===
          ''
          ? null
          : parseFloat(
            req.body.longitude
          );
    }

    // ─────────────────────────────────────────
    // Enum fields
    // ─────────────────────────────────────────

    if (
      req.body.landUse !==
      undefined
    ) {
      data.landUse =
        req.body.landUse;
    }

    if (
      req.body.status !==
      undefined
    ) {
      data.status =
        req.body.status;
    }

    if (
      req.body.riskStatus !==
      undefined
    ) {
      data.riskStatus =
        req.body.riskStatus;
    }

    // ─────────────────────────────────────────
    // Date
    // ─────────────────────────────────────────

    if (
      req.body.lastTransactionDate !==
      undefined
    ) {
      data.lastTransactionDate =
        req.body.lastTransactionDate
          ? new Date(
            req.body.lastTransactionDate
          )
          : null;
    }

    // ─────────────────────────────────────────
    // Last updated
    // ─────────────────────────────────────────

    data.lastUpdated =
      new Date();

    // ─────────────────────────────────────────
    // Update database
    // ─────────────────────────────────────────

    const parcel =
      await prisma.parcel.update({
        where: { id },

        data,

        include:
          ownershipInclude,
      });

    console.log(
      '✅ Parcel updated:',
      {
        ulpin: parcel.ulpin,
        latitude:
          parcel.latitude,
        longitude:
          parcel.longitude,
      }
    );

    return res.json({
      success: true,

      message:
        'Parcel updated successfully.',

      data: {
        parcel,
      },
    });
  } catch (error) {
    console.error(
      '❌ updateParcel error:',
      error
    );

    next(error);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/parcels/:id
// ─────────────────────────────────────────────────────────────

/**
 * Delete parcel by ID.
 *
 * Requires ADMIN according to your
 * existing route middleware.
 */
export const deleteParcel = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    // ─────────────────────────────────────────
    // Check parcel exists
    // ─────────────────────────────────────────

    const existing =
      await prisma.parcel.findUnique({
        where: { id },
      });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          'Parcel not found.',
      });
    }

    // ─────────────────────────────────────────
    // Delete
    // ─────────────────────────────────────────

    await prisma.parcel.delete({
      where: { id },
    });

    return res.json({
      success: true,

      message: `Parcel "${existing.ulpin}" deleted successfully.`,
    });
  } catch (error) {
    console.error('❌ deleteParcel error:',
      error);

    next(error);
  }
};