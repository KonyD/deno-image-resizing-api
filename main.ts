import {
  ImageMagick,
  initialize,
  MagickGeometry,
} from "https://deno.land/x/imagemagick_deno@0.0.25/mod.ts";
import { parseMediaType } from "https://deno.land/std@0.200.0/media_types/mod.ts";

await initialize();

function parseParams(reqURL: URL) {
  const image = reqURL.searchParams.get("image");
  if (image == null) {
    return "Missing 'image' query parameter.";
  }
  const width = Number(reqURL.searchParams.get("width")) || 0;
  const height = Number(reqURL.searchParams.get("height")) || 0;

  const maxDimension = 2048;

  if (height === 0 && width === 0) {
    return "Missing non-zero 'width' or 'height' query parameters.";
  }
  if (height < 0 || width < 0) {
    return "Negative width or height is not supported.";
  }
  if (height > maxDimension || width > maxDimension) {
    return "Width and height cannot exceed ${maxDimension}.";
  }

  const mode = reqURL.searchParams.get("mode") || "resize";
  if (mode !== "resize" && mode !== "crop") {
    return "Mode not accepted.";
  }

  return {
    image,
    width,
    height,
    mode,
  };
}

async function getRemoteImage(image: string) {
  const sourceRes = await fetch(image);
  if (!sourceRes.ok) {
    return "Error retrieving image from URL.";
  }
  const mediaType = parseMediaType(sourceRes.headers.get("Content-Type")!)[0];
  if (mediaType.split("/")[0] !== "image") {
    return "URL is not an image type.";
  }

  return {
    buffer: new Uint8Array(await sourceRes.arrayBuffer()),
    mediaType,
  };
}

function modifyImage(
  imageBuffer: Uint8Array,
  params: { width: number; height: number; mode: "resize" | "crop" }
) {
  const sizingData = new MagickGeometry(params.width, params.height);
  sizingData.ignoreAspectRatio = params.width > 0 && params.height > 0;
  return new Promise<Uint8Array>((resolve) => {
    ImageMagick.read(imageBuffer, (image) => {
      if (params.mode === "resize") {
        image.resize(sizingData);
      } else {
        image.crop(sizingData);
      }

      image.write((data) => resolve(data));
    });
  });
}

Deno.serve(async (req: Request) => {
  const reqURL = new URL(req.url);
  const params = parseParams(reqURL);
  if (typeof params === "string") {
    return new Response(params, { status: 404 });
  }
  await getRemoteImage(params.image);
  const remoteImage = await getRemoteImage(params.image);
  if (typeof remoteImage === "string") {
    return new Response(remoteImage, { status: 400 });
  }

  const modifedImage = await modifyImage(remoteImage.buffer, params);

  return new Response(modifedImage, {
    headers: {
      "Content-Type": remoteImage.mediaType,
    },
  });
});
