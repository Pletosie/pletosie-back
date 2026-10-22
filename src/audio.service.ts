import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';
// ffprobe is packaged for the host platform and never invoked through a shell.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const probePath: string = require('ffprobe-static').path;
const execute = promisify(execFile);
@Injectable()
export class AudioService {
  readonly cloudEnabled = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
  constructor() {
    if (this.cloudEnabled)
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
  }
  async validate(base64: string): Promise<{ bytes: Buffer; mime: string }> {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
      throw new BadRequestException('Encodage audio invalide.');
    const bytes = Buffer.from(base64, 'base64');
    const knownContainer = bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) || bytes.subarray(0,4).toString()==='OggS' || bytes.subarray(4,8).toString()==='ftyp' || bytes.subarray(0,3).toString()==='ID3' || (bytes[0]===0xff && (bytes[1]&0xe0)===0xe0);
    if(!knownContainer)throw new BadRequestException('Le contenu ne correspond pas à un format audio accepté.');
    if (bytes.length < 16 || bytes.length > 10 * 1024 * 1024)
      throw new BadRequestException('Le vocal doit peser moins de 10 Mo.');
    const dir = await mkdtemp(join(tmpdir(), 'pletosie-audio-'));
    const file = join(dir, 'upload');
    try {
      await writeFile(file, bytes);
      const { stdout } = await execute(
        probePath,
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_format',
          '-show_streams',
          '-of',
          'json',
          file,
        ],
        { timeout: 15000, maxBuffer: 128 * 1024, windowsHide: true },
      );
      const data = JSON.parse(stdout) as {
        streams: {
          codec_type: string;
          duration?: string;
          tags?: Record<string, string>;
        }[];
        format: { format_name: string; duration?: string };
      };
      if (
        !data.streams?.length ||
        data.streams.some((s) => s.codec_type !== 'audio') ||
        data.streams.length !== 1
      )
        throw new BadRequestException(
          'Seul un fichier audio sans image ni vidéo est accepté.',
        );
      let duration = Number(data.format.duration || data.streams[0].duration);
      if (!Number.isFinite(duration)) {
        const packets = await execute(
          probePath,
          [
            '-v',
            'error',
            '-protocol_whitelist',
            'file,pipe',
            '-show_entries',
            'packet=pts_time,duration_time',
            '-of',
            'csv=p=0',
            file,
          ],
          { timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
        );
        duration = packets.stdout
          .trim()
          .split('\n')
          .reduce((max, line) => {
            const [t, d] = line.split(',').map(Number);
            return Number.isFinite(t)
              ? Math.max(max, t + (Number.isFinite(d) ? d : 0))
              : max;
          }, 0);
      }
      if (!Number.isFinite(duration) || duration <= 0 || duration > 180)
        throw new BadRequestException(
          'Le vocal doit durer au maximum trois minutes et avoir une durée vérifiable.',
        );
      const f = data.format.format_name;
      const mime = f.includes('webm')
        ? 'audio/webm'
        : f.includes('ogg')
          ? 'audio/ogg'
          : f.includes('mp3')
            ? 'audio/mpeg'
            : f.includes('mp4')
              ? 'audio/mp4'
              : null;
      if (!mime)
        throw new BadRequestException('Format audio non pris en charge.');
      return { bytes, mime };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        'Impossible de vérifier ce vocal. Essayez un autre enregistrement ou utilisez le texte.',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async store(base64: string, mime: string, id: string): Promise<string> {
    if (!this.cloudEnabled) {
      if (process.env.NODE_ENV === 'production')
        throw new ServiceUnavailableException(
          'Le stockage privé des vocaux doit être configuré.',
        );
      return base64;
    }
    const uploaded = await cloudinary.uploader.upload(
      `data:${mime};base64,${base64}`,
      {
        resource_type: 'video',
        type: 'authenticated',
        public_id: `pletosie-vocaux/${id}`,
        overwrite: false,
      },
    );
    return `cloudinary:${uploaded.public_id}`;
  }
  async read(value: string): Promise<Buffer> {
    if (!value.startsWith('cloudinary:')) return Buffer.from(value, 'base64');
    const publicId = value.slice(11);
    const url = cloudinary.url(publicId, {
      resource_type: 'video',
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Le vocal est momentanément indisponible.',
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024)
      throw new ServiceUnavailableException();
    return bytes;
  }
}
