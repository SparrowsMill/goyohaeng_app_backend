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
}