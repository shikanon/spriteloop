// Flood from image borders so enclosed subject details remain intact. Operates on RGBA.
export function removeSolidBackground(
  data,
  width,
  height,
  {
    tolerance = 30,
    softness = 2,
    preserveWhite = true,
    backgroundColor = "#ffffff",
  } = {},
) {
  const target = backgroundColor
    .slice(1)
    .match(/../g)
    .map((c) => parseInt(c, 16));
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let tail = 0,
    head = 0;
  const distance = (i) =>
    Math.max(
      Math.abs(target[0] - data[i * 4]),
      Math.abs(target[1] - data[i * 4 + 1]),
      Math.abs(target[2] - data[i * 4 + 2]),
    );
  const add = (i) => {
    if (i < 0 || i >= count || visited[i] || distance(i) > tolerance + softness)
      return;
    visited[i] = 1;
    queue[tail++] = i;
  };
  if (preserveWhite) {
    for (let x = 0; x < width; x++) {
      add(x);
      add((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      add(y * width);
      add(y * width + width - 1);
    }
    while (head < tail) {
      const i = queue[head++],
        x = i % width;
      if (x > 0) add(i - 1);
      if (x < width - 1) add(i + 1);
      add(i - width);
      add(i + width);
    }
  } else {
    for (let i = 0; i < count; i++)
      if (distance(i) <= tolerance + softness) visited[i] = 1;
  }
  for (let i = 0; i < count; i++)
    if (visited[i]) {
      const d = distance(i);
      const alpha = softness
        ? Math.max(0, Math.min(1, (d - tolerance) / softness))
        : 0;
      data[i * 4 + 3] = Math.round(data[i * 4 + 3] * alpha);
      // Remove the selected matte from feathered edge colors.
      if (alpha > 0 && alpha < 1)
        for (let c = 0; c < 3; c++)
          data[i * 4 + c] = Math.max(
            0,
            Math.min(
              255,
              Math.round((data[i * 4 + c] - target[c] * (1 - alpha)) / alpha),
            ),
          );
    }
  return data;
}

// Compatibility for existing white-background callers.
export const removeWhite = removeSolidBackground;
