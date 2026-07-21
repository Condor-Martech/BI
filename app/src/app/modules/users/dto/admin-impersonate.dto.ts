import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class AdminImpersonateDto {
  @ApiProperty({ example: 'target@condor.com.br' })
  @IsEmail()
  email: string;
}

export class AdminImpersonateResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  exp: number;

  @ApiProperty({
    type: 'object',
    properties: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
    },
  })
  target: { email: string; name: string; role: string };
}
