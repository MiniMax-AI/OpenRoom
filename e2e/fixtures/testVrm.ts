/**
 * Builds a tiny VRM 1.0 model (a blocky figure) for tests, so no third-party
 * model is needed. Boxes hang on the required humanoid bones; the eyes and
 * mouth have morph targets bound to the blink / aa / emotion expressions.
 */

type Vec3 = [number, number, number];

interface Prim {
  positions: number[];
  normals: number[];
  indices: number[];
  /** Morph target position deltas, one array per target */
  targets?: number[][];
  color: [number, number, number, number];
}

/** Axis-aligned box centered at `c` with size `s` (per-face normals). */
function box(c: Vec3, s: Vec3): { positions: number[]; normals: number[]; indices: number[] } {
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const faces: Array<{ n: Vec3; v: Vec3[] }> = [
    {
      n: [1, 0, 0],
      v: [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
    },
    {
      n: [-1, 0, 0],
      v: [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
    },
    {
      n: [0, 1, 0],
      v: [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
    },
    {
      n: [0, -1, 0],
      v: [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
    },
    {
      n: [0, 0, 1],
      v: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    },
    {
      n: [0, 0, -1],
      v: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
      ],
    },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, i) => {
    f.v.forEach(([x, y, z]) => {
      positions.push(cx + x * hx, cy + y * hy, cz + z * hz);
      normals.push(...f.n);
    });
    const o = i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, indices };
}

function merge(parts: ReturnType<typeof box>[]) {
  const out = { positions: [] as number[], normals: [] as number[], indices: [] as number[] };
  for (const p of parts) {
    const offset = out.positions.length / 3;
    out.positions.push(...p.positions);
    out.normals.push(...p.normals);
    out.indices.push(...p.indices.map((i) => i + offset));
  }
  return out;
}

/** Deltas that squash a mesh vertically toward y0 (factor 0 = flat). */
function squashY(positions: number[], y0: number, factor: number): number[] {
  return positions.map((v, i) => (i % 3 === 1 ? (y0 - v) * (1 - factor) : 0));
}

function stretchY(positions: number[], y0: number, factor: number): number[] {
  return positions.map((v, i) => (i % 3 === 1 ? (v - y0) * (factor - 1) : 0));
}

export function buildTestVrm(): Buffer {
  const SKIN: Prim['color'] = [0.98, 0.86, 0.78, 1];
  const CLOTH: Prim['color'] = [0.45, 0.4, 0.95, 1];
  const DARK: Prim['color'] = [0.12, 0.1, 0.2, 1];

  // Bone layout (local translations). Facing +Z, the model's left is +X.
  const bones: Array<{ name: string; parent: number | null; t: Vec3; prims?: Prim[] }> = [];
  const add = (name: string, parent: number | null, t: Vec3, prims?: Prim[]) => {
    bones.push({ name, parent, t, prims });
    return bones.length - 1;
  };
  const solid = (b: ReturnType<typeof box>, color: Prim['color']): Prim => ({ ...b, color });

  const hips = add('hips', null, [0, 0.95, 0], [solid(box([0, 0, 0], [0.32, 0.16, 0.18]), CLOTH)]);
  const spine = add(
    'spine',
    hips,
    [0, 0.12, 0],
    [solid(box([0, 0.18, 0], [0.34, 0.36, 0.2]), CLOTH)],
  );
  const neck = add(
    'neck',
    spine,
    [0, 0.4, 0],
    [solid(box([0, 0.04, 0], [0.08, 0.08, 0.08]), SKIN)],
  );
  const eyes = merge([
    box([-0.05, 0.12, 0.111], [0.035, 0.05, 0.01]),
    box([0.05, 0.12, 0.111], [0.035, 0.05, 0.01]),
  ]);
  const mouth = box([0, 0.04, 0.111], [0.07, 0.02, 0.01]);
  const head = add(
    'head',
    neck,
    [0, 0.08, 0],
    [
      solid(box([0, 0.11, 0], [0.22, 0.24, 0.22]), SKIN),
      {
        ...eyes,
        color: DARK,
        // blink, happy, angry, sad, relaxed
        targets: [
          squashY(eyes.positions, 0.12, 0.1),
          squashY(eyes.positions, 0.13, 0.4),
          squashY(eyes.positions, 0.11, 0.6),
          stretchY(eyes.positions, 0.12, 1.2),
          squashY(eyes.positions, 0.12, 0.5),
        ],
      },
      {
        ...mouth,
        color: DARK,
        targets: [stretchY(mouth.positions, 0.04, 3), stretchY(mouth.positions, 0.04, 2)],
      },
    ],
  );
  void head;
  for (const side of [1, -1]) {
    const prefix = side > 0 ? 'left' : 'right';
    const upperArm = add(
      `${prefix}UpperArm`,
      spine,
      [side * 0.2, 0.33, 0],
      [solid(box([side * 0.13, 0, 0], [0.26, 0.08, 0.08]), CLOTH)],
    );
    const lowerArm = add(
      `${prefix}LowerArm`,
      upperArm,
      [side * 0.26, 0, 0],
      [solid(box([side * 0.12, 0, 0], [0.24, 0.07, 0.07]), SKIN)],
    );
    add(
      `${prefix}Hand`,
      lowerArm,
      [side * 0.24, 0, 0],
      [solid(box([side * 0.05, 0, 0], [0.1, 0.06, 0.08]), SKIN)],
    );
    const upperLeg = add(
      `${prefix}UpperLeg`,
      hips,
      [side * 0.09, -0.06, 0],
      [solid(box([0, -0.2, 0], [0.11, 0.4, 0.11]), DARK)],
    );
    const lowerLeg = add(
      `${prefix}LowerLeg`,
      upperLeg,
      [0, -0.42, 0],
      [solid(box([0, -0.2, 0], [0.09, 0.4, 0.09]), DARK)],
    );
    add(
      `${prefix}Foot`,
      lowerLeg,
      [0, -0.42, 0],
      [solid(box([0, -0.03, 0.04], [0.1, 0.06, 0.18]), DARK)],
    );
  }

  // ---------------------------------------------------------------- glTF assembly
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const pushView = (data: Buffer, target?: number) => {
    const pad = (4 - (data.length % 4)) % 4;
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: data.length,
      ...(target ? { target } : {}),
    });
    chunks.push(data, Buffer.alloc(pad));
    byteLength += data.length + pad;
    return bufferViews.length - 1;
  };
  const floatAccessor = (values: number[]) => {
    const view = pushView(Buffer.from(new Float32Array(values).buffer), 34962);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i++) {
      min[i % 3] = Math.min(min[i % 3], values[i]);
      max[i % 3] = Math.max(max[i % 3], values[i]);
    }
    accessors.push({
      bufferView: view,
      componentType: 5126,
      count: values.length / 3,
      type: 'VEC3',
      min,
      max,
    });
    return accessors.length - 1;
  };
  const indexAccessor = (values: number[]) => {
    const view = pushView(Buffer.from(new Uint16Array(values).buffer), 34963);
    accessors.push({ bufferView: view, componentType: 5123, count: values.length, type: 'SCALAR' });
    return accessors.length - 1;
  };

  const materials: object[] = [];
  const meshes: object[] = [];
  const nodes: Array<Record<string, unknown>> = bones.map((b) => ({
    name: b.name,
    translation: b.t,
    children: [] as number[],
  }));
  let eyesNode = -1;
  let mouthNode = -1;

  bones.forEach((b, boneIndex) => {
    if (b.parent !== null) (nodes[b.parent].children as number[]).push(boneIndex);
    (b.prims ?? []).forEach((p, primIndex) => {
      materials.push({
        pbrMetallicRoughness: { baseColorFactor: p.color, metallicFactor: 0, roughnessFactor: 0.8 },
      });
      const primitive: Record<string, unknown> = {
        attributes: { POSITION: floatAccessor(p.positions), NORMAL: floatAccessor(p.normals) },
        indices: indexAccessor(p.indices),
        material: materials.length - 1,
      };
      if (p.targets) primitive.targets = p.targets.map((t) => ({ POSITION: floatAccessor(t) }));
      meshes.push({
        name: `${b.name}-${primIndex}`,
        primitives: [primitive],
        ...(p.targets ? { weights: p.targets.map(() => 0) } : {}),
      });
      nodes.push({ name: `${b.name}-mesh-${primIndex}`, mesh: meshes.length - 1 });
      const meshNode = nodes.length - 1;
      (nodes[boneIndex].children as number[]).push(meshNode);
      if (b.name === 'head' && primIndex === 1) eyesNode = meshNode;
      if (b.name === 'head' && primIndex === 2) mouthNode = meshNode;
    });
  });
  nodes.forEach((n) => {
    if (Array.isArray(n.children) && n.children.length === 0) delete n.children;
  });

  const humanBones: Record<string, { node: number }> = {};
  bones.forEach((b, i) => {
    humanBones[b.name] = { node: i };
  });
  const bind = (node: number, index: number) => ({
    morphTargetBinds: [{ node, index, weight: 1 }],
  });

  const json = {
    asset: { version: '2.0', generator: 'OpenRoom test fixture' },
    extensionsUsed: ['VRMC_vrm'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        meta: {
          name: 'Test Companion',
          version: '1',
          authors: ['OpenRoom tests'],
          licenseUrl: 'https://vrm.dev/licenses/1.0/',
          avatarPermission: 'everyone',
          commercialUsage: 'personalNonProfit',
          allowExcessivelyViolentUsage: false,
          allowExcessivelySexualUsage: false,
          allowPoliticalOrReligiousUsage: false,
          allowAntisocialOrHateUsage: false,
          creditNotation: 'unnecessary',
          allowRedistribution: true,
          modification: 'allowModificationRedistribution',
        },
        humanoid: { humanBones },
        expressions: {
          preset: {
            blink: bind(eyesNode, 0),
            happy: bind(eyesNode, 1),
            angry: bind(eyesNode, 2),
            sad: bind(eyesNode, 3),
            relaxed: bind(eyesNode, 4),
            aa: bind(mouthNode, 0),
            oh: bind(mouthNode, 1),
          },
        },
      },
    },
  };

  const bin = Buffer.concat(chunks);
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.write('JSON', 4, 'ascii');
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.write('BIN\0', 4, 'ascii');
  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, bin]);
}
