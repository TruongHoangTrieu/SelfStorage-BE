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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { StorageUnitTypesService } from './storage-unit-types.service';
import { CreateStorageUnitTypeDto } from './dto/create-storage-unit-type.dto';
import { UpdateStorageUnitTypeDto } from './dto/update-storage-unit-type.dto';
import { FilterStorageUnitTypeDto } from './dto/filter-storage-unit-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Storage Unit Types')
@UseGuards(JwtAuthGuard)
@Controller('storage-unit-types')
export class StorageUnitTypesController {
  constructor(
    private readonly storageUnitTypesService: StorageUnitTypesService,
  ) {}

  @ApiOperation({ summary: 'Lấy danh sách loại ngăn kho (Hỗ trợ lọc theo facilityId)' })
  @ApiResponse({ status: 200, description: 'Danh sách các loại ngăn kho kèm số lượng kho khả dụng' })
  @Public()
  @Get()
  async findAll(@Query() filter: FilterStorageUnitTypeDto) {
    return this.storageUnitTypesService.findAll(filter.facilityId);
  }

  @ApiOperation({ summary: 'Lấy thông tin chi tiết loại ngăn kho theo ID' })
  @ApiParam({ name: 'id', description: 'ID loại ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết loại ngăn kho' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy loại ngăn kho' })
  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.storageUnitTypesService.findById(id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo mới loại ngăn kho (Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo loại ngăn kho thành công' })
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

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật loại ngăn kho (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID loại ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
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
