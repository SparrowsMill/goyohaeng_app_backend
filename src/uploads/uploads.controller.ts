import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  memoryStorage,
} from 'multer';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  UploadsService,
} from './uploads.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService:
      UploadsService,
  ) {}

  @ApiOperation({
    summary: '이미지 업로드',
    description:
      '이미지 파일을 Cloudinary에 업로드하고 Records API에서 사용할 imageUrl을 반환합니다.',
  })
  @ApiConsumes(
    'multipart/form-data',
  )
  @ApiBody({
    schema: {
      type: 'object',

      required: [
        'file',
      ],

      properties: {
        file: {
          type: 'string',
          format: 'binary',

          description:
            'JPG, PNG, WEBP 이미지. 최대 10MB',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      '이미지 업로드 성공',

    schema: {
      example: {
        imageUrl:
          'https://res.cloudinary.com/example/image/upload/v1234567890/goyohaeng/records/example.jpg',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      '파일이 없거나 지원하지 않는 이미지 형식',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Post('images')
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        storage:
          memoryStorage(),

        limits: {
          fileSize:
            10 *
            1024 *
            1024,
        },

        fileFilter: (
          _req,
          file,
          callback,
        ) => {
          const allowedMimeTypes =
            [
              'image/jpeg',
              'image/png',
              'image/webp',
            ];

          if (
            !allowedMimeTypes.includes(
              file.mimetype,
            )
          ) {
            callback(
              new BadRequestException(
                'JPG, PNG, WEBP 형식의 이미지만 업로드할 수 있습니다.',
              ),
              false,
            );

            return;
          }

          callback(
            null,
            true,
          );
        },
      },
    ),
  )
  async uploadImage(
    @UploadedFile()
    file:
      | Express.Multer.File
      | undefined,
  ) {
    return this.uploadsService
      .uploadImage(
        file,
      );
  }
}