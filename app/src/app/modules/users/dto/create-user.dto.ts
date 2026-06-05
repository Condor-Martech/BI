import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsEnum, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import { AccountRelatedResponseDto } from '../../accounts/dto/create-account.dto';
import { ReportRelatedResponseDto } from '../../reports/dto/create-report.dto';

export enum ROLE_TYPES {
    MANAGER = "manager",
    ADMIN = "admin",
    USER = "user"
}

export class CreateUserDto {
    @ApiProperty({ description: 'Nome completo do usuário', example: 'João da Silva' })
    @IsNotEmpty({ message: 'Nome é campo obrigatório' })
    name: string;

    @ApiPropertyOptional({ description: 'Código islv externo do usuário', example: 'ABC123' })
    userIslv?: string;

    @ApiPropertyOptional({ description: 'Senha inicial do usuário. Nunca exponha senhas reais.', example: 'SenhaForte123' })
    password?: string;

    @ApiProperty({ description: 'Email de acesso do usuário', example: 'joao.silva@empresa.com' })
    @IsEmail()
    @IsNotEmpty({ message: 'Email é campo obrigatório' })
    email: string;

    @IsEnum(ROLE_TYPES)
    @IsNotEmpty({ message: 'Role é campo obrigatório' })
    @ApiProperty({
        description: 'Papel (role) do usuário no sistema',
        enum: ROLE_TYPES,
        example: ROLE_TYPES.USER,
    })
    role: ROLE_TYPES;

    @ApiPropertyOptional({ description: 'Email da conta BI a ser vinculada ao usuário (obrigatório para role user)', example: 'conta@empresa.com' })
    @IsOptional()
    @IsString()
    accountUser?: string;

    @ApiPropertyOptional({ description: 'Lista de IDs de grupos Power BI vinculados', type: [String], example: ['6685a57d6dddeaa56c4a5f15'] })
    @IsArray()
    @IsOptional()
    groupIdPB?: string[];

    @ApiPropertyOptional({ description: 'Lista de IDs de relatórios Power BI vinculados', type: [String], example: ['6e277bac-97e4-43cc-ad65-b96dbdd65f57'] })
    @IsArray()
    @IsOptional()
    reportIdPB?: string[];

    @ApiPropertyOptional({ description: 'Habilita o módulo de Análise com IA para o usuário (padrão: false)', example: false })
    @IsOptional()
    @IsBoolean()
    chatIaEnabled?: boolean;
}

export class UserResponseDto {
    @ApiProperty({ description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
    @IsString()
    id: string;

    @ApiProperty({ description: 'Nome completo do usuário', example: 'João da Silva' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Email do usuário', example: 'joao.silva@empresa.com' })
    @IsString()
    email: string;

    @ApiPropertyOptional({ description: 'Código islv externo do usuário', example: 'ABC123' })
    userIslv?: string;

    @ApiProperty({ description: 'Role do usuário no sistema', enum: ROLE_TYPES, example: ROLE_TYPES.USER })
    @IsString()
    role: string;

    @ApiPropertyOptional({ description: 'Lista de IDs de contas BI vinculadas', type: [String], example: ['6685a57d6dddeaa56c4a5f15'] })
    @IsArray()
    @IsOptional()
    accountID?: string[];

    @ApiPropertyOptional({ description: 'Lista de IDs de grupos Power BI', type: [String], example: ['6685a57d6dddeaa56c4a5f15'] })
    @IsArray()
    @IsOptional()
    groupByPB?: string[];

    @ApiPropertyOptional({ description: 'Lista de IDs de relatórios Power BI', type: [String], example: ['6e277bac-97e4-43cc-ad65-b96dbdd65f57'] })
    @IsArray()
    @IsOptional()
    reportsByPB?: string[];

    @ApiProperty({ description: 'Token JWT de acesso gerado após autenticação', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString()
    access_token: string;
}

export class UserRelatedResponseDto {
    @ApiProperty({ description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
    @IsString()
    _id: string;

    @ApiProperty({ description: 'Nome completo do usuário', example: 'João da Silva' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Email do usuário', example: 'joao.silva@empresa.com' })
    @IsString()
    email: string;

    @ApiProperty({ description: 'Role do usuário no sistema', enum: ROLE_TYPES, example: ROLE_TYPES.USER })
    @IsString()
    role: string;

}

export class UserResponseWithPopulateDto {
    @ApiProperty({ description: 'ID MongoDB do usuário', example: '6685a57d6dddeaa56c4a5f15' })
    @IsString()
    id: string;

    @ApiProperty({ description: 'Nome completo do usuário', example: 'João da Silva' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Role do usuário no sistema', enum: ROLE_TYPES, example: ROLE_TYPES.USER })
    @IsString()
    role: string;

    @ApiProperty({ description: 'Email do usuário', example: 'joao.silva@empresa.com' })
    @IsString()
    email: string;

    @ApiPropertyOptional({ description: 'Contas BI vinculadas ao usuário (populadas)', type: [AccountRelatedResponseDto] })
    @IsArray()
    @IsOptional()
    accountID?: AccountRelatedResponseDto[];

    @ApiPropertyOptional({ description: 'Grupos Power BI vinculados ao usuário', type: [String], example: ['6685a57d6dddeaa56c4a5f15'] })
    @IsArray()
    @IsOptional()
    group?: string[];

    @ApiPropertyOptional({ description: 'Relatórios Power BI vinculados ao usuário (populados)', type: [ReportRelatedResponseDto] })
    @IsArray()
    @IsOptional()
    report?: ReportRelatedResponseDto[];

    @ApiPropertyOptional({ description: 'Módulo de Análise com IA habilitado para o usuário', example: false })
    @IsBoolean()
    @IsOptional()
    chatIaEnabled?: boolean;

}