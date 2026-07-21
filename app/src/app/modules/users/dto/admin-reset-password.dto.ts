import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'target@condor.com.br' })
  @IsEmail()
  email: string;

  @ApiProperty({ required: false, minimum: 8, maximum: 64, default: 12 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(64)
  length?: number;
}

export class AdminResetPasswordResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  resetAt: Date;
}
