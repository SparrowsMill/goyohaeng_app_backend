import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';

@Injectable()
export class UploadsService {
  constructor(
    private readonly configService: ConfigService,
  ) {
    cloudinary.config({
      cloud_name:
        this.configService.getOrThrow<string>(
          'CLOUDINARY_CLOUD_NAME',
        ),

      api_key:
        this.configService.getOrThrow<string>(
          'CLOUDINARY_API_KEY',
        ),

      api_secret:
        this.configService.getOrThrow<string>(
          'CLOUDINARY_API_SECRET',
        ),

      secure: true,
    });
  }

  async uploadImage(
    file: Express.Multer.File | undefined,
  ): Promise<{
    imageUrl: string;
  }> {
    if (!file) {
      throw new BadRequestException(
        '이미지 파일이 필요합니다.',
      );
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (
      !allowedMimeTypes.includes(
        file.mimetype,
      )
    ) {
      throw new BadRequestException(
        'JPG, PNG, WEBP 형식의 이미지만 업로드할 수 있습니다.',
      );
    }

    try {
      const result =
        await new Promise<UploadApiResponse>(
          (resolve, reject) => {
            const uploadStream =
              cloudinary.uploader.upload_stream(
                {
                  folder:
                    'goyohaeng/records',

                  resource_type:
                    'image',
                },

                (
                  error,
                  result,
                ) => {
                  if (
                    error ||
                    !result
                  ) {
                    reject(
                      error ??
                        new Error(
                          'Cloudinary upload failed',
                        ),
                    );

                    return;
                  }

                  resolve(
                    result,
                  );
                },
              );

            uploadStream.end(
              file.buffer,
            );
          },
        );

      return {
        imageUrl:
          result.secure_url,
      };
    } catch (error) {
      console.error(
        'Cloudinary upload error:',
        error,
      );

      throw new InternalServerErrorException(
        '이미지 업로드 중 오류가 발생했습니다.',
      );
    }
  }

  async deleteImageByUrl(
  imageUrl: string,
): Promise<void> {
  const publicId =
    this.extractPublicIdFromUrl(
      imageUrl,
    );

  if (!publicId) {
    console.warn(
      'Cloudinary publicId를 추출할 수 없는 URL:',
      imageUrl,
    );

    return;
  }

  try {
    await cloudinary.uploader.destroy(
      publicId,
      {
        resource_type: 'image',
        invalidate: true,
      },
    );
  } catch (error) {
    console.error(
      'Cloudinary image delete error:',
      error,
    );

    throw new InternalServerErrorException(
      '이미지 삭제 중 오류가 발생했습니다.',
    );
  }
}

private extractPublicIdFromUrl(
  imageUrl: string,
): string | null {
  try {
    const url =
      new URL(imageUrl);

    /*
     * Cloudinary 공식 CDN URL만 허용
     */
    if (
      url.hostname !==
      'res.cloudinary.com'
    ) {
      return null;
    }

    const cloudName =
      process.env
        .CLOUDINARY_CLOUD_NAME;

    if (!cloudName) {
      return null;
    }

    /*
     * 우리 Cloudinary 계정에
     * 올라간 이미지인지 확인
     *
     * 예:
     * /my-cloud/image/upload/...
     */
    const marker =
      `/${cloudName}/image/upload/`;

    if (
      !url.pathname.startsWith(
        marker,
      )
    ) {
      return null;
    }

    let path =
      url.pathname.slice(
        marker.length,
      );

    /*
     * Cloudinary version 제거
     *
     * v1789388583/
     */
    path = path.replace(
      /^v\d+\//,
      '',
    );

    /*
     * 확장자 제거
     *
     * goyohaeng/records/abc.png
     * ->
     * goyohaeng/records/abc
     */
    const publicId =
      path.replace(
        /\.[^/.]+$/,
        '',
      );

    return publicId || null;
  } catch {
    return null;
  }
}
}