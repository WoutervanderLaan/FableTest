import { BufferGeometry, Color, Float32BufferAttribute } from "three";

type V3 = [number, number, number];

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  public quad(a: V3, b: V3, c: V3, d: V3, normals: V3, color: Color): void {
    const base = this.positions.length / 3;

    for (const position of [a, b, c, d]) {
      this.positions.push(position[0], position[1], position[2]);
      this.normals.push(normals[0], normals[1], normals[2]);
      this.colors.push(color.r, color.g, color.b);
    }

    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  public build(): BufferGeometry {
    const set = 3;
    const geometry = new BufferGeometry();

    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(this.positions, set),
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(this.normals, set),
    );
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute(this.colors, set),
    );
    geometry.setIndex(this.indices);
    return geometry;
  }
}

export function makeSquare(): BufferGeometry {
  const m = new MeshBuilder();

  m.quad(
    [-1, -1, 0],
    [1, -1, 0],
    [1, 1, 0],
    [-1, 1, 0],
    [0, 0, 1],
    new Color("#00ff95"),
  );

  return m.build();
}

export function makeCube(color = new Color("#e8a33d")): BufferGeometry {
  const m = new MeshBuilder();
  const h = 1;

  m.quad(
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
    [0, 0, 1],
    new Color("#00ff95"),
  ); // +Z
  m.quad(
    [h, -h, -h],
    [-h, -h, -h],
    [-h, h, -h],
    [h, h, -h],
    [0, 0, -1],
    new Color("#ff0404"),
  ); // -Z
  m.quad([h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0], color); // +X
  m.quad([-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0], color); // -X
  m.quad([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0], color); // +Y
  m.quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0], color); // -Y
  return m.build();
}

export function makePatchwork(n = 16): BufferGeometry {
  const m = new MeshBuilder();

  const palette = ["#6fa24b", "#c7c94f", "#3e8e7e", "#b8b2a7", "#8c7a5c"].map(
    (c) => new Color(c),
  );

  Array.from({ length: n }).forEach((_column, columnIndex) => {
    Array.from({ length: n }).forEach((_row, rowIndex) => {
      m.quad(
        [rowIndex, 0, columnIndex + 1],
        [rowIndex + 1, 0, columnIndex + 1],
        [rowIndex + 1, 0, columnIndex],
        [rowIndex, 0, columnIndex],
        [0, 1, 0],
        palette[(columnIndex + rowIndex) % palette.length],
      );
    });
  });

  return m.build();
}
