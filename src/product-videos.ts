import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
function configured() {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;
  if (!cloud_name || !api_key || !api_secret)
    throw new ServiceUnavailableException(
      'Configurez Cloudinary pour importer des vidéos de créations.',
    );
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return { cloud_name, api_key, api_secret };
}
export function videoUploadTicket() {
  const config = configured();
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: 'pletosie/creations/' + randomUUID(),
    allowed_formats: 'mp4,webm,mov',
    type: 'upload',
  };
  return {
    url:
      'https://api.cloudinary.com/v1_1/' + config.cloud_name + '/video/upload',
    apiKey: config.api_key,
    params,
    signature: cloudinary.utils.api_sign_request(params, config.api_secret),
  };
}
export async function verifyProductVideo(publicId: string) {
  configured();
  let resource;
  try {
    resource = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
      type: 'upload',
      media_metadata: true,
    });
  } catch {
    throw new BadRequestException(
      'La vidéo importée est introuvable. Réessayez.',
    );
  }
  if (
    !['mp4', 'webm', 'mov'].includes(resource.format) ||
    !Number.isFinite(resource.duration) ||
    resource.duration <= 0 ||
    resource.duration > 180 ||
    !Number.isFinite(resource.bytes) ||
    resource.bytes > 50 * 1024 * 1024 ||
    !resource.width ||
    !resource.height
  ) {
    await cloudinary.uploader
      .destroy(publicId, { resource_type: 'video' })
      .catch(() => {});
    throw new BadRequestException(
      'La vidéo doit durer moins de 3 minutes et peser au maximum 50 Mo (MP4, WebM ou MOV).',
    );
  }
  return {
    url: String(resource.secure_url).replace(
      '/video/upload/',
      '/video/upload/f_mp4,vc_h264/',
    ),
    duration: resource.duration,
  };
}
