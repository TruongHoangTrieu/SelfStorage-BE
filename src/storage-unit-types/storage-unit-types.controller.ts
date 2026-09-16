import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StorageUnitTypesService } from './storage-unit-types.service';
import { CreateStorageUnitTypeDto } from './dto/create-storage-unit-type.dto';
import { UpdateStorageUnitTypeDto } from './dto/update-storage-unit-type.dto';
import { FilterStorageUnitTypeDto } from './dto/filter-storage-unit-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@UseGuards(JwtAuthGuard)
@Controller('storage-unit-types')
export class StorageUnitTypesController {
  constructor(
    private readonly storageUnitTypesService: StorageUnitTypesService,
  ) {}

  @Public()
  @Get()
  async findAll(@Query() filter: FilterStorageUnitTypeDto) {
    return this.storageUnitTypesService.findAll(filter.facilityId);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.storageUnitTypesService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateStorageUnitTypeDto) {
    return this.storageUnitTypesService.create(createDto);
  }

  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateStorageUnitTypeDto,
  ) {
    return this.storageUnitTypesService.update(id, updateDto);
  }
}
