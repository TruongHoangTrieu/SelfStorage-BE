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
import { StorageUnitsService } from './storage-units.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { FilterStorageUnitDto } from './dto/filter-storage-unit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '../common/enums/role.enum';

@ApiTags('Storage Units')
@UseGuards(JwtAuthGuard)
@Controller('storage-units')
export class StorageUnitsController {
  constructor(private readonly storageUnitsService: StorageUnitsService) {}

  @ApiOperation({ summary: 'Lấy danh sách các ngăn kho vật lý (Hỗ trợ lọc theo cơ sở, loại kho, trạng thái)' })
  @ApiResponse({ status: 200, description: 'Danh sách ngăn kho' })
  @Public()
  @Get()
  async findAll(@Query() filter: FilterStorageUnitDto) {
    return this.storageUnitsService.findAll(filter);
  }

  @ApiOperation({ summary: 'Lấy thông tin chi tiết một ngăn kho theo ID' })
  @ApiParam({ name: 'id', description: 'ID ngăn kho', example: 1 })
  @ApiResponse({ status: 200, description: 'Chi tiết ngăn kho' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy ngăn kho' })
  @Public()
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.storageUnitsService.findById(id);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Tạo mới một ngăn kho vật lý (Manager / Admin)' })
  @ApiResponse({ status: 201, description: 'Tạo ngăn kho thành công' })
  @ApiResponse({ status: 400, description: 'Loại kho không thuộc cơ sở chỉ định' })
  @ApiResponse({ status: 409, description: 'Mã số phòng đã tồn tại trong cơ sở' })
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

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cập nhật thông tin ngăn kho (Manager / Admin)' })
  @ApiParam({ name: 'id', description: 'ID ngăn kho', example: 1 })
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
    @Body() updateDto: UpdateStorageUnitDto,
  ) {
    return this.storageUnitsService.update(id, updateDto);
  }
}
