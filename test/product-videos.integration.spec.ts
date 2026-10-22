import { v2 as cloudinary } from 'cloudinary';
import { videoUploadTicket, verifyProductVideo } from '../src/product-videos';
import { validate } from 'class-validator';
import { VideoVerifyDto } from '../src/dto';
describe('Vidéos des créations', () => {
  const previous = { ...process.env };
  beforeEach(() => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test';
    process.env.CLOUDINARY_API_KEY = 'public-key';
    process.env.CLOUDINARY_API_SECRET = 'private-secret';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  it('signe un import vidéo sans exposer le secret', () => {
    const ticket = videoUploadTicket();
    expect(ticket.url).toBe(
      'https://api.cloudinary.com/v1_1/test/video/upload',
    );
    expect(ticket.params.public_id).toMatch(/^pletosie\/creations\//);
    expect(JSON.stringify(ticket)).not.toContain('private-secret');
    expect(ticket.signature).toBeTruthy();
  });
  it('vérifie la vidéo et fournit une lecture MP4', async () => {
    jest
      .spyOn(cloudinary.api, 'resource')
      .mockResolvedValue({
        format: 'mp4',
        duration: 10,
        bytes: 10000,
        width: 320,
        height: 240,
        secure_url: 'https://res.cloudinary.com/test/video/upload/v1/clip.mp4',
      } as never);
    expect((await verifyProductVideo('pletosie/creations/test')).url).toContain(
      '/f_mp4,vc_h264/',
    );
  });
  it('refuse et nettoie une vidéo trop longue ou un fichier sans image', async () => {
    const destroy = jest
      .spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValue({ result: 'ok' });
    for (const metadata of [
      { duration: 181, width: 320, height: 240 },
      { duration: 10, width: 0, height: 0 },
    ]) {
      jest
        .spyOn(cloudinary.api, 'resource')
        .mockResolvedValue({
          format: 'mp4',
          bytes: 10000,
          ...metadata,
        } as never);
      await expect(
        verifyProductVideo('pletosie/creations/test'),
      ).rejects.toThrow('3 minutes');
    }
    expect(destroy).toHaveBeenCalledTimes(2);
  });
  it('refuse une référence étrangère au dossier des créations', async () => {
    expect(
      await validate(
        Object.assign(new VideoVerifyDto(), {
          publicId: 'another-folder/asset',
        }),
      ),
    ).not.toHaveLength(0);
  });
});
