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
import { StorageUnitsService } from './storage-units.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { FilterStorageUnitDto } from './dto/filter-storage-unit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@UseGuards(JwtAuthGuard)
@Controller('storage-units')
export class StorageUnitsController {
  constructor(private readonly storageUnitsService: StorageUnitsService) {}

  @Public()
  @Get()
  async findAll(@Query() filter: FilterStorageUnitDto) {
    return this.storageUnitsService.findAll(filter);
  }

  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.storageUnitsService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(
    UserRole.FACILITY_MANAGER,
    UserRole.BUSINESS_OPERATIONS_MANAGER,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateStorageUnitDto) {
    return this.storageUnitsService.create(createDto);
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
    @Body() updateDto: UpdateStorageUnitDto,
  ) {
    return this.storageUnitsService.update(id, updateDto);
  }
}
