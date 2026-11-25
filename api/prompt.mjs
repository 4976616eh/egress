/** Tool schema + instructions that turn a plan image into the structure the front end rasterises into the editor grid. */

const box = {
  type: 'object',
  properties: {
    x0: { type: 'integer', minimum: 0, maximum: 1000 },
    y0: { type: 'integer', minimum: 0, maximum: 1000 },
    x1: { type: 'integer', minimum: 0, maximum: 1000 },
    y1: { type: 'integer', minimum: 0, maximum: 1000 },
  },
  required: ['x0', 'y0', 'x1', 'y1'],
};

export const TOOL = {
  name: 'submit_floor_plan',
  description: 'Submit the geometry of the floor plan found in the image.',
  input_schema: {
    type: 'object',
    properties: {
      // Listed first on purpose: the model thinks through the layout before it commits to numbers.
      analysis: {
        type: 'string',
        description:
          'Brief reasoning (max ~120 words): overall footprint of the building, where the corridors run, how the rooms attach to them, where the exits are, and which floor you chose if several are drawn.',
      },
      corridors: {
        type: 'array',
        description:
          'Walkable circulation space that is not a room: corridors, lobbies, halls, entrance areas. Build L/T shapes from several overlapping boxes. Boxes should reach the wall line of the rooms next to them.',
        items: box,
      },
      rooms: {
        type: 'array',
        description: 'Every enclosed room (classrooms, offices, toilets, storage, gym, canteen...). Box = outer bounds including its walls.',
        items: {
          type: 'object',
          properties: {
            ...box.properties,
            name: { type: 'string', description: 'Label printed on the plan (room number or name), exactly as written. If none is visible, use an empty string.' },
            kind: { type: 'string', enum: ['classroom', 'office', 'service', 'other'], description: 'classroom = teaching room/lab/gym/hall where children gather; office = staff/admin room; service = toilet, storage, technical room; other = anything else.' },
          },
          required: ['x0', 'y0', 'x1', 'y1', 'name', 'kind'],
        },
      },
      stairs: {
        type: 'array',
        description: 'Staircases.',
        items: {
          type: 'object',
          properties: {
            ...box.properties,
            climbs: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Direction on the image in which a person walks while going up the stairs.' },
          },
          required: ['x0', 'y0', 'x1', 'y1', 'climbs'],
        },
      },
      doors: {
        type: 'array',
        description: 'One point at the centre of every door that connects a room (or hall) to a corridor, placed on the wall line. Every room that is connected on the plan must have at least one door.',
        items: { type: 'object', properties: { x: { type: 'integer', minimum: 0, maximum: 1000 }, y: { type: 'integer', minimum: 0, maximum: 1000 } }, required: ['x', 'y'] },
      },
      exits: {
        type: 'array',
        description: 'Doors in the OUTER wall that lead out of the building (marked by green exit signs/running-man icons, arrows pointing outside, or obvious entrance doors). Point at the centre of the opening, on the outer wall line.',
        items: {
          type: 'object',
          properties: {
            x: { type: 'integer', minimum: 0, maximum: 1000 },
            y: { type: 'integer', minimum: 0, maximum: 1000 },
            width_m: { type: 'number', description: 'Estimated clear width in metres (single door ~1, double door ~2, main entrance ~3).' },
          },
          required: ['x', 'y', 'width_m'],
        },
      },
      notes: {
        type: 'string',
        description: 'One or two short sentences in Bulgarian for the user: what you were unsure about or could not read (e.g. a blurry area, several floors drawn).',
      },
    },
    required: ['analysis', 'corridors', 'rooms', 'stairs', 'doors', 'exits', 'notes'],
  },
};

export const SYSTEM_PROMPT = `You convert images of building evacuation plans and floor plans into structured geometry for an evacuation simulator.

Coordinate system - use it for every number you return:
- The whole image maps to a 1000 x 1000 square, each axis normalised on its own: x = 0 is the left edge, x = 1000 the right edge, y = 0 the top edge, y = 1000 the bottom edge. A wide image still spans 0-1000 horizontally and vertically.
- Look at where things actually are relative to the image edges and be as precise as you can. Walls are usually 5-15 units thick, so being off by 20 units misplaces a wall.

Rules:
- The plan is a top-down view. Ignore the legend, title block, scale bar, text boxes, furniture, fire-extinguisher and other safety icons, and the red/green evacuation route arrows (they only help you find exits).
- Determine room geometry from the actual wall lines and partitions. Room names, numbers, people counts, colored fills, furniture, and evacuation arrows are annotations; never use them as room boundaries.
- For every room, trace the full enclosed space from wall centerline to wall centerline. Do not shrink a room to avoid overlap or to make its label fit. Keep its width, height, and area proportional to the visible wall boundaries.
- Adjacent rooms share the same partition line: use the same coordinate for both sides of that wall. Do not leave artificial gaps between neighboring rooms, and do not overlap their interiors.
- Trace the outside wall first, then the internal partitions. Check that the room boxes fill the enclosed rooms in the footprint and that corridors remain only in the open circulation spaces between them.
- The user message says which floor of the building this is (floor index 0 = ground floor, 1 = first floor above it, ...). If several floors are drawn on one image, extract only that floor; if the image shows a single floor, extract it as it is. If you cannot tell which drawn floor is the requested one, pick the best match and say so in notes.
- On floors above the ground floor, return an empty exits array: people leave those floors by the stairs, so mark every staircase carefully in stairs.
- Rooms must not overlap each other. Adjacent rooms share a wall line. Leave corridor space between room rows as the plan shows it.
- Do not invent rooms, doors or exits that are not on the plan. Do not skip rooms that are.
- Exits are only openings to the outside of the building. Doors between rooms and corridors go in doors.
- Always call submit_floor_plan exactly once.`;
