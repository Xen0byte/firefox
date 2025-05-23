export const description = `
Texture Usages Validation Tests in Render Pass and Compute Pass.
`;

import { makeTestGroup } from '../../../../../common/framework/test_group.js';
import { pp } from '../../../../../common/util/preprocessor.js';
import { assert } from '../../../../../common/util/util.js';
import { GPUConst } from '../../../../constants.js';
import {
  kDepthStencilFormats,
  kDepthStencilFormatResolvedAspect,
  isStencilTextureFormat,
  isDepthTextureFormat,
} from '../../../../format_info.js';
import { AllFeaturesMaxLimitsGPUTest } from '../../../../gpu_test.js';
import * as vtu from '../../validation_test_utils.js';

type TextureBindingType =
  | 'sampled-texture'
  | 'multisampled-texture'
  | 'writeonly-storage-texture'
  | 'readonly-storage-texture'
  | 'readwrite-storage-texture';
const kTextureBindingTypes = [
  'sampled-texture',
  'multisampled-texture',
  'writeonly-storage-texture',
  'readonly-storage-texture',
  'readwrite-storage-texture',
] as const;

const SIZE = 32;
class TextureUsageTracking extends AllFeaturesMaxLimitsGPUTest {
  createTestTexture(
    options: {
      width?: number;
      height?: number;
      arrayLayerCount?: number;
      mipLevelCount?: number;
      sampleCount?: number;
      format?: GPUTextureFormat;
      usage?: GPUTextureUsageFlags;
    } = {}
  ): GPUTexture {
    const {
      width = SIZE,
      height = SIZE,
      arrayLayerCount = 1,
      mipLevelCount = 1,
      sampleCount = 1,
      format = 'r32float',
      usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    } = options;

    return this.createTextureTracked({
      size: { width, height, depthOrArrayLayers: arrayLayerCount },
      mipLevelCount,
      sampleCount,
      dimension: '2d',
      format,
      usage,
    });
  }

  createBindGroupLayout(
    binding: number,
    bindingType: TextureBindingType,
    viewDimension: GPUTextureViewDimension,
    options: {
      format?: GPUTextureFormat;
      sampleType?: GPUTextureSampleType;
    } = {}
  ): GPUBindGroupLayout {
    const { sampleType, format } = options;
    let entry: Omit<GPUBindGroupLayoutEntry, 'binding' | 'visibility'>;
    switch (bindingType) {
      case 'sampled-texture':
        entry = { texture: { viewDimension, sampleType } };
        break;
      case 'multisampled-texture':
        entry = { texture: { viewDimension, multisampled: true, sampleType } };
        break;
      case 'writeonly-storage-texture':
        assert(format !== undefined);
        entry = { storageTexture: { access: 'write-only', format, viewDimension } };
        break;
      case 'readonly-storage-texture':
        assert(format !== undefined);
        entry = { storageTexture: { access: 'read-only', format, viewDimension } };
        break;
      case 'readwrite-storage-texture':
        assert(format !== undefined);
        entry = { storageTexture: { access: 'read-write', format, viewDimension } };
        break;
    }

    return this.device.createBindGroupLayout({
      entries: [
        { binding, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, ...entry },
      ],
    });
  }

  createBindGroup(
    binding: number,
    resource: GPUTextureView,
    bindingType: TextureBindingType,
    viewDimension: GPUTextureViewDimension,
    options: {
      format?: GPUTextureFormat;
      sampleType?: GPUTextureSampleType;
    } = {}
  ): GPUBindGroup {
    return this.device.createBindGroup({
      entries: [{ binding, resource }],
      layout: this.createBindGroupLayout(binding, bindingType, viewDimension, options),
    });
  }

  createAndExecuteBundle(
    binding: number,
    bindGroup: GPUBindGroup,
    pass: GPURenderPassEncoder,
    depthStencilFormat?: GPUTextureFormat
  ) {
    const bundleEncoder = this.device.createRenderBundleEncoder({
      colorFormats: ['r32float'],
      depthStencilFormat,
    });
    bundleEncoder.setBindGroup(binding, bindGroup);
    const bundle = bundleEncoder.finish();
    pass.executeBundles([bundle]);
  }

  beginSimpleRenderPass(encoder: GPUCommandEncoder, view: GPUTextureView): GPURenderPassEncoder {
    return encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
  }

  /**
   * Create two bind groups with one texture view.
   */
  makeTwoBindGroupsWithOneTextureView(usage1: TextureBindingType, usage2: TextureBindingType) {
    const view = this.createTestTexture({
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    }).createView();
    const bindGroupLayouts = [
      this.createBindGroupLayout(0, usage1, '2d', {
        sampleType: 'unfilterable-float',
        format: 'r32float',
      }),
      this.createBindGroupLayout(0, usage2, '2d', {
        sampleType: 'unfilterable-float',
        format: 'r32float',
      }),
    ];
    return {
      bindGroupLayouts,
      bindGroups: [
        this.device.createBindGroup({
          layout: bindGroupLayouts[0],
          entries: [{ binding: 0, resource: view }],
        }),
        this.device.createBindGroup({
          layout: bindGroupLayouts[1],
          entries: [{ binding: 0, resource: view }],
        }),
      ],
    };
  }

  testValidationScope(
    compute: boolean,
    usage1: TextureBindingType,
    usage2: TextureBindingType
  ): {
    bindGroup0: GPUBindGroup;
    bindGroup1: GPUBindGroup;
    encoder: GPUCommandEncoder;
    pass: GPURenderPassEncoder | GPUComputePassEncoder;
    pipeline: GPURenderPipeline | GPUComputePipeline;
  } {
    const { bindGroupLayouts, bindGroups } = this.makeTwoBindGroupsWithOneTextureView(
      usage1,
      usage2
    );

    const encoder = this.device.createCommandEncoder();
    const pass = compute
      ? encoder.beginComputePass()
      : this.beginSimpleRenderPass(encoder, this.createTestTexture().createView());

    // Create pipeline. Note that bindings unused in pipeline should be validated too.
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts,
    });
    const pipeline = compute
      ? vtu.createNoOpComputePipeline(this, pipelineLayout)
      : vtu.createNoOpRenderPipeline(this, pipelineLayout, 'r32float');
    return {
      bindGroup0: bindGroups[0],
      bindGroup1: bindGroups[1],
      encoder,
      pass,
      pipeline,
    };
  }

  setPipeline(
    pass: GPURenderPassEncoder | GPUComputePassEncoder,
    pipeline: GPURenderPipeline | GPUComputePipeline
  ) {
    if (pass instanceof GPUComputePassEncoder) {
      pass.setPipeline(pipeline as GPUComputePipeline);
    } else {
      pass.setPipeline(pipeline as GPURenderPipeline);
    }
  }

  issueDrawOrDispatch(pass: GPURenderPassEncoder | GPUComputePassEncoder) {
    if (pass instanceof GPUComputePassEncoder) {
      pass.dispatchWorkgroups(1);
    } else {
      pass.draw(3, 1, 0, 0);
    }
  }

  setComputePipelineAndCallDispatch(pass: GPUComputePassEncoder, layout?: GPUPipelineLayout) {
    const pipeline = vtu.createNoOpComputePipeline(this, layout);
    pass.setPipeline(pipeline);
    pass.dispatchWorkgroups(1);
  }

  skipIfNeedStorageTexturesByVisibilityAndNoStorageTextures(visibility: number) {
    if (!this.isCompatibility) {
      return;
    }

    this.skipIf(
      (visibility & GPUConst.ShaderStage.VERTEX) !== 0 &&
        !(this.device.limits.maxStorageTexturesInVertexStage! >= 2),
      `maxStorageTexturesInVertexStage(${this.device.limits.maxStorageTexturesInVertexStage}) < 2`
    );

    this.skipIf(
      (visibility & GPUConst.ShaderStage.FRAGMENT) !== 0 &&
        !(this.device.limits.maxStorageTexturesInFragmentStage! >= 2),
      `maxStorageTexturesInFragmentStage(${this.device.limits.maxStorageTexturesInFragmentStage}) < 2`
    );
  }

  skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(s: string, visibility: number) {
    if (
      s === 'readonly-storage-texture' ||
      s === 'writeonly-storage-texture' ||
      s === 'readwrite-storage-texture'
    ) {
      this.skipIfNeedStorageTexturesByVisibilityAndNoStorageTextures(visibility);
    }
  }
}

export const g = makeTestGroup(TextureUsageTracking);

const BASE_LEVEL = 1;
const TOTAL_LEVELS = 6;
const BASE_LAYER = 1;
const TOTAL_LAYERS = 6;
const SLICE_COUNT = 2;

g.test('subresources_and_binding_types_combination_for_color')
  .desc(
    `
    Test the resource usage rules by using two views of the same GPUTexture in a usage scope. Tests
    various combinations of {sampled, storage, render target} usages, mip-level ranges, and
    array-layer ranges, in {compute pass, render pass, render pass via bundle}.
      - Error if a subresource (level/layer) is used as read+write or write+write in the scope,
        except when both usages are writeonly-storage-texture which is allowed.
  `
  )
  .params(u =>
    u
      .combine('compute', [false, true])
      .expandWithParams(
        p =>
          [
            { _usageOK: true, type0: 'sampled-texture', type1: 'sampled-texture' },
            { _usageOK: false, type0: 'sampled-texture', type1: 'writeonly-storage-texture' },
            { _usageOK: true, type0: 'sampled-texture', type1: 'readonly-storage-texture' },
            { _usageOK: false, type0: 'sampled-texture', type1: 'readwrite-storage-texture' },
            { _usageOK: false, type0: 'sampled-texture', type1: 'render-target' },
            // Race condition upon multiple writable storage texture is valid.
            // For p.compute === true, fails at pass.dispatch because aliasing exists.
            {
              _usageOK: !p.compute,
              type0: 'writeonly-storage-texture',
              type1: 'writeonly-storage-texture',
            },
            {
              _usageOK: true,
              type0: 'readonly-storage-texture',
              type1: 'readonly-storage-texture',
            },
            {
              _usageOK: !p.compute,
              type0: 'readwrite-storage-texture',
              type1: 'readwrite-storage-texture',
            },
            {
              _usageOK: false,
              type0: 'readonly-storage-texture',
              type1: 'writeonly-storage-texture',
            },
            {
              _usageOK: false,
              type0: 'readonly-storage-texture',
              type1: 'readwrite-storage-texture',
            },
            {
              _usageOK: false,
              type0: 'writeonly-storage-texture',
              type1: 'readwrite-storage-texture',
            },
            { _usageOK: false, type0: 'readonly-storage-texture', type1: 'render-target' },
            { _usageOK: false, type0: 'writeonly-storage-texture', type1: 'render-target' },
            { _usageOK: false, type0: 'readwrite-storage-texture', type1: 'render-target' },
            { _usageOK: false, type0: 'render-target', type1: 'render-target' },
          ] as const
      )
      .beginSubcases()
      .combine('binding0InBundle', [false, true])
      .combine('binding1InBundle', [false, true])
      .unless(
        p =>
          // We can't set 'render-target' in bundle, so we need to exclude it from bundle.
          (p.binding0InBundle && p.type0 === 'render-target') ||
          (p.binding1InBundle && p.type1 === 'render-target') ||
          // We can't set 'render-target' or bundle in compute.
          (p.compute &&
            (p.binding0InBundle ||
              p.binding1InBundle ||
              p.type0 === 'render-target' ||
              p.type1 === 'render-target'))
      )
      .combineWithParams([
        // Two texture usages are binding to the same texture subresource.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL,
          levelCount1: 1,
          baseLayer1: BASE_LAYER,
          layerCount1: 1,
          _resourceSuccess: false,
        },

        // Two texture usages are binding to different mip levels of the same texture.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL + 1,
          levelCount1: 1,
          baseLayer1: BASE_LAYER,
          layerCount1: 1,
          _resourceSuccess: true,
        },

        // Two texture usages are binding to different array layers of the same texture.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL,
          levelCount1: 1,
          baseLayer1: BASE_LAYER + 1,
          layerCount1: 1,
          _resourceSuccess: true,
        },

        // The second texture usage contains the whole mip chain where the first texture usage is
        // using.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: 0,
          levelCount1: TOTAL_LEVELS,
          baseLayer1: BASE_LAYER,
          layerCount1: 1,
          _resourceSuccess: false,
        },

        // The second texture usage contains all layers where the first texture usage is using.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL,
          levelCount1: 1,
          baseLayer1: 0,
          layerCount1: TOTAL_LAYERS,
          _resourceSuccess: false,
        },

        // The second texture usage contains all subresources where the first texture usage is
        // using.
        {
          levelCount0: 1,
          layerCount0: 1,
          baseLevel1: 0,
          levelCount1: TOTAL_LEVELS,
          baseLayer1: 0,
          layerCount1: TOTAL_LAYERS,
          _resourceSuccess: false,
        },

        // Both of the two usages access a few mip levels on the same layer but they don't overlap.
        {
          levelCount0: SLICE_COUNT,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL + SLICE_COUNT,
          levelCount1: 3,
          baseLayer1: BASE_LAYER,
          layerCount1: 1,
          _resourceSuccess: true,
        },

        // Both of the two usages access a few mip levels on the same layer and they overlap.
        {
          levelCount0: SLICE_COUNT,
          layerCount0: 1,
          baseLevel1: BASE_LEVEL + SLICE_COUNT - 1,
          levelCount1: 3,
          baseLayer1: BASE_LAYER,
          layerCount1: 1,
          _resourceSuccess: false,
        },

        // Both of the two usages access a few array layers on the same level but they don't
        // overlap.
        {
          levelCount0: 1,
          layerCount0: SLICE_COUNT,
          baseLevel1: BASE_LEVEL,
          levelCount1: 1,
          baseLayer1: BASE_LAYER + SLICE_COUNT,
          layerCount1: 3,
          _resourceSuccess: true,
        },

        // Both of the two usages access a few array layers on the same level and they overlap.
        {
          levelCount0: 1,
          layerCount0: SLICE_COUNT,
          baseLevel1: BASE_LEVEL,
          levelCount1: 1,
          baseLayer1: BASE_LAYER + SLICE_COUNT - 1,
          layerCount1: 3,
          _resourceSuccess: false,
        },

        // Both of the two usages access a few array layers and mip levels but they don't overlap.
        {
          levelCount0: SLICE_COUNT,
          layerCount0: SLICE_COUNT,
          baseLevel1: BASE_LEVEL + SLICE_COUNT,
          levelCount1: 3,
          baseLayer1: BASE_LAYER + SLICE_COUNT,
          layerCount1: 3,
          _resourceSuccess: true,
        },

        // Both of the two usages access a few array layers and mip levels and they overlap.
        {
          levelCount0: SLICE_COUNT,
          layerCount0: SLICE_COUNT,
          baseLevel1: BASE_LEVEL + SLICE_COUNT - 1,
          levelCount1: 3,
          baseLayer1: BASE_LAYER + SLICE_COUNT - 1,
          layerCount1: 3,
          _resourceSuccess: false,
        },
      ])
      .unless(
        p =>
          // Every color attachment or storage texture can use only one single subresource.
          (p.type0 !== 'sampled-texture' && (p.levelCount0 !== 1 || p.layerCount0 !== 1)) ||
          (p.type1 !== 'sampled-texture' && (p.levelCount1 !== 1 || p.layerCount1 !== 1)) ||
          // All color attachments' size should be the same.
          (p.type0 === 'render-target' &&
            p.type1 === 'render-target' &&
            p.baseLevel1 !== BASE_LEVEL)
      )
  )
  .fn(t => {
    const {
      compute,
      binding0InBundle,
      binding1InBundle,
      levelCount0,
      layerCount0,
      baseLevel1,
      baseLayer1,
      levelCount1,
      layerCount1,
      type0,
      type1,
      _usageOK,
      _resourceSuccess,
    } = t.params;

    t.skipIf(
      t.isCompatibility,
      'multiple views of the same texture in a single draw/dispatch are not supported in compat, nor are sub ranges of layers'
    );

    const texture = t.createTestTexture({
      arrayLayerCount: TOTAL_LAYERS,
      mipLevelCount: TOTAL_LEVELS,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const dimension0 = layerCount0 !== 1 ? '2d-array' : '2d';
    const view0 = texture.createView({
      dimension: dimension0,
      baseMipLevel: BASE_LEVEL,
      mipLevelCount: levelCount0,
      baseArrayLayer: BASE_LAYER,
      arrayLayerCount: layerCount0,
    });

    const dimension1 = layerCount1 !== 1 ? '2d-array' : '2d';
    const view1 = texture.createView({
      dimension: dimension1,
      baseMipLevel: baseLevel1,
      mipLevelCount: levelCount1,
      baseArrayLayer: baseLayer1,
      arrayLayerCount: layerCount1,
    });

    const viewsAreSame =
      dimension0 === dimension1 &&
      layerCount0 === layerCount1 &&
      BASE_LEVEL === baseLevel1 &&
      levelCount0 === levelCount1 &&
      BASE_LAYER === baseLayer1 &&
      layerCount0 === layerCount1;
    if (!viewsAreSame && t.isCompatibility) {
      t.skip('different views of same texture are not supported in compatibility mode');
    }

    const encoder = t.device.createCommandEncoder();
    if (type0 === 'render-target') {
      // Note that type1 is 'render-target' too. So we don't need to create bindings.
      assert(type1 === 'render-target');
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: view0,
            clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            view: view1,
            clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.end();
    } else {
      const pass = compute
        ? encoder.beginComputePass()
        : t.beginSimpleRenderPass(
            encoder,
            type1 === 'render-target' ? view1 : t.createTestTexture().createView()
          );

      const bgls: GPUBindGroupLayout[] = [];
      // Create bind groups. Set bind groups in pass directly or set bind groups in bundle.
      const storageTextureFormat0 = type0 === 'sampled-texture' ? undefined : 'r32float';
      const sampleType0 = type0 === 'sampled-texture' ? 'unfilterable-float' : undefined;

      const bgl0 = t.createBindGroupLayout(0, type0, dimension0, {
        format: storageTextureFormat0,
        sampleType: sampleType0,
      });
      const bindGroup0 = t.device.createBindGroup({
        layout: bgl0,
        entries: [{ binding: 0, resource: view0 }],
      });
      bgls.push(bgl0);

      if (binding0InBundle) {
        assert(pass instanceof GPURenderPassEncoder);
        t.createAndExecuteBundle(0, bindGroup0, pass);
      } else {
        pass.setBindGroup(0, bindGroup0);
      }
      if (type1 !== 'render-target') {
        const storageTextureFormat1 = type1 === 'sampled-texture' ? undefined : 'r32float';
        const sampleType1 = type1 === 'sampled-texture' ? 'unfilterable-float' : undefined;
        const bgl1 = t.createBindGroupLayout(1, type1, dimension1, {
          format: storageTextureFormat1,
          sampleType: sampleType1,
        });
        const bindGroup1 = t.device.createBindGroup({
          layout: bgl1,
          entries: [{ binding: 1, resource: view1 }],
        });
        bgls.push(bgl1);

        if (binding1InBundle) {
          assert(pass instanceof GPURenderPassEncoder);
          t.createAndExecuteBundle(1, bindGroup1, pass);
        } else {
          pass.setBindGroup(1, bindGroup1);
        }
      }
      if (compute) {
        t.setComputePipelineAndCallDispatch(
          pass as GPUComputePassEncoder,
          t.device.createPipelineLayout({ bindGroupLayouts: bgls })
        );
      }
      pass.end();
    }

    const success = _resourceSuccess || _usageOK;
    t.expectValidationError(() => {
      encoder.finish();
    }, !success);
  });

g.test('subresources_and_binding_types_combination_for_aspect')
  .desc(
    `
    Test the resource usage rules by using two views of the same GPUTexture in a usage scope. Tests
    various combinations of {sampled, render target} usages, {all, depth-only, stencil-only} aspects
    that overlap a given subresources in {compute pass, render pass, render pass via bundle}.
      - Error if a subresource (level/layer/aspect) is used as read+write or write+write in the
        scope.
  `
  )
  .params(u =>
    u
      .combine('compute', [false, true])
      .combine('binding0InBundle', [false, true])
      .combine('binding1InBundle', [false, true])
      .combine('format', kDepthStencilFormats)
      .beginSubcases()
      .combineWithParams([
        {
          baseLevel: BASE_LEVEL,
          baseLayer: BASE_LAYER,
          _resourceSuccess: false,
        },
        {
          baseLevel: BASE_LEVEL + 1,
          baseLayer: BASE_LAYER,
          _resourceSuccess: true,
        },
        {
          baseLevel: BASE_LEVEL,
          baseLayer: BASE_LAYER + 1,
          _resourceSuccess: true,
        },
      ])
      .combine('aspect0', ['all', 'depth-only', 'stencil-only'] as const)
      .combine('aspect1', ['all', 'depth-only', 'stencil-only'] as const)
      .unless(
        p =>
          (p.aspect0 === 'stencil-only' && !isStencilTextureFormat(p.format)) ||
          (p.aspect1 === 'stencil-only' && !isStencilTextureFormat(p.format))
      )
      .unless(
        p =>
          (p.aspect0 === 'depth-only' && !isDepthTextureFormat(p.format)) ||
          (p.aspect1 === 'depth-only' && !isDepthTextureFormat(p.format))
      )
      .combineWithParams([
        {
          type0: 'sampled-texture',
          type1: 'sampled-texture',
          _usageSuccess: true,
        },
        {
          type0: 'sampled-texture',
          type1: 'render-target',
          _usageSuccess: false,
        },
      ] as const)
      .unless(
        // Can't sample a multiplanar texture without selecting an aspect.
        p =>
          isDepthTextureFormat(p.format) &&
          isStencilTextureFormat(p.format) &&
          ((p.aspect0 === 'all' && p.type0 === 'sampled-texture') ||
            (p.aspect1 === 'all' && p.type1 === 'sampled-texture'))
      )
      .unless(
        p =>
          // We can't set 'render-target' in bundle, so we need to exclude it from bundle.
          p.binding1InBundle && p.type1 === 'render-target'
      )
      .unless(
        p =>
          // We can't set 'render-target' or bundle in compute. Note that type0 is definitely not
          // 'render-target'
          p.compute && (p.binding0InBundle || p.binding1InBundle || p.type1 === 'render-target')
      )
      .unless(
        p =>
          // Depth-stencil attachment views must encompass all aspects of the texture. Invalid
          // cases are for depth-stencil textures when the aspect is not 'all'.
          p.type1 === 'render-target' &&
          isDepthTextureFormat(p.format) &&
          isStencilTextureFormat(p.format) &&
          p.aspect1 !== 'all'
      )
  )
  .fn(t => {
    const {
      compute,
      binding0InBundle,
      binding1InBundle,
      format,
      baseLevel,
      baseLayer,
      aspect0,
      aspect1,
      type0,
      type1,
      _resourceSuccess,
      _usageSuccess,
    } = t.params;

    t.skipIfTextureFormatNotSupported(format);
    t.skipIf(t.isCompatibility, 'sub ranges of layers are not supported in compat mode');

    const texture = t.createTestTexture({
      arrayLayerCount: TOTAL_LAYERS,
      mipLevelCount: TOTAL_LEVELS,
      format,
    });

    const view0 = texture.createView({
      dimension: '2d',
      baseMipLevel: BASE_LEVEL,
      mipLevelCount: 1,
      baseArrayLayer: BASE_LAYER,
      arrayLayerCount: 1,
      aspect: aspect0,
    });

    const view1 = texture.createView({
      dimension: '2d',
      baseMipLevel: baseLevel,
      mipLevelCount: 1,
      baseArrayLayer: baseLayer,
      arrayLayerCount: 1,
      aspect: aspect1,
    });
    const view1ResolvedFormat = kDepthStencilFormatResolvedAspect[format][aspect1]!;
    const view1HasDepth = isDepthTextureFormat(view1ResolvedFormat);
    const view1HasStencil = isStencilTextureFormat(view1ResolvedFormat);

    const encoder = t.device.createCommandEncoder();
    // Color attachment's size should match depth/stencil attachment's size. Note that if
    // type1 !== 'render-target' then there's no depthStencilAttachment to match anyway.
    const depthStencilFormat = type1 === 'render-target' ? view1ResolvedFormat : undefined;

    const size = SIZE >> baseLevel;
    const pass = compute
      ? encoder.beginComputePass()
      : encoder.beginRenderPass({
          colorAttachments: [
            {
              view: t.createTestTexture({ width: size, height: size }).createView(),
              clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          depthStencilAttachment: depthStencilFormat
            ? {
                view: view1,
                depthLoadOp: view1HasDepth ? 'load' : undefined,
                depthStoreOp: view1HasDepth ? 'discard' : undefined,
                stencilLoadOp: view1HasStencil ? 'load' : undefined,
                stencilStoreOp: view1HasStencil ? 'discard' : undefined,
              }
            : undefined,
        });

    const aspectSampleType = (format: GPUTextureFormat, aspect: typeof aspect0) => {
      switch (aspect) {
        case 'depth-only':
          return 'depth';
        case 'stencil-only':
          return 'uint';
        case 'all':
          assert(isDepthTextureFormat(format) !== isStencilTextureFormat(format));
          if (isStencilTextureFormat(format)) {
            return 'uint';
          }
          return 'depth';
      }
    };

    // Create bind groups. Set bind groups in pass directly or set bind groups in bundle.
    const bindGroup0 = t.createBindGroup(0, view0, type0, '2d', {
      sampleType: type0 === 'sampled-texture' ? aspectSampleType(format, aspect0) : undefined,
    });
    if (binding0InBundle) {
      assert(pass instanceof GPURenderPassEncoder);
      t.createAndExecuteBundle(0, bindGroup0, pass, depthStencilFormat);
    } else {
      pass.setBindGroup(0, bindGroup0);
    }
    if (type1 !== 'render-target') {
      const bindGroup1 = t.createBindGroup(1, view1, type1, '2d', {
        sampleType: type1 === 'sampled-texture' ? aspectSampleType(format, aspect1) : undefined,
      });
      if (binding1InBundle) {
        assert(pass instanceof GPURenderPassEncoder);
        t.createAndExecuteBundle(1, bindGroup1, pass, depthStencilFormat);
      } else {
        pass.setBindGroup(1, bindGroup1);
      }
    }
    if (compute) t.setComputePipelineAndCallDispatch(pass as GPUComputePassEncoder);
    pass.end();

    const disjointAspects =
      (aspect0 === 'depth-only' && aspect1 === 'stencil-only') ||
      (aspect0 === 'stencil-only' && aspect1 === 'depth-only');

    // If subresources' mip/array slices has no overlap, or their binding types don't conflict,
    // it will definitely success no matter what aspects they are binding to.
    const success = disjointAspects || _resourceSuccess || _usageSuccess;

    t.expectValidationError(() => {
      encoder.finish();
    }, !success);
  });

g.test('shader_stages_and_visibility,storage_write')
  .desc(
    `
    Test that stage visibility doesn't affect resource usage validation.
    - Use a texture as sampled, with 'readVisibility' {0,VERTEX,FRAGMENT,COMPUTE}
    - Use a {same,different} texture as storage, with 'writeVisibility' {0,FRAGMENT,COMPUTE}

    There should be a validation error IFF the same texture was used.
  `
  )
  .params(u =>
    u
      .combine('compute', [false, true])
      .beginSubcases()
      .combine('secondUseConflicts', [false, true])
      .combine('readVisibility', [
        0,
        GPUConst.ShaderStage.VERTEX,
        GPUConst.ShaderStage.FRAGMENT,
        GPUConst.ShaderStage.COMPUTE,
      ])
      .combine('writeVisibility', [0, GPUConst.ShaderStage.FRAGMENT, GPUConst.ShaderStage.COMPUTE])
      .combine('readEntry', [
        { texture: { sampleType: 'unfilterable-float' } },
        { storageTexture: { access: 'read-only', format: 'r32float' } },
      ] as const)
      .combine('storageWriteAccess', ['write-only', 'read-write'] as const)
  )
  .fn(t => {
    const {
      compute,
      readEntry,
      storageWriteAccess,
      readVisibility,
      writeVisibility,
      secondUseConflicts,
    } = t.params;

    t.skipIfNeedStorageTexturesByVisibilityAndNoStorageTextures(readVisibility | writeVisibility);

    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
    const view = t.createTestTexture({ usage }).createView();
    const view2 = secondUseConflicts ? view : t.createTestTexture({ usage }).createView();

    const bgl = t.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: readVisibility, ...readEntry },
        {
          binding: 1,
          visibility: writeVisibility,
          storageTexture: { access: storageWriteAccess, format: 'r32float' },
        },
      ],
    });
    const bindGroup = t.device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: view2 },
      ],
    });

    const encoder = t.device.createCommandEncoder();
    if (compute) {
      const pass = encoder.beginComputePass();
      pass.setBindGroup(0, bindGroup);

      t.setComputePipelineAndCallDispatch(
        pass,
        t.device.createPipelineLayout({
          bindGroupLayouts: [bgl],
        })
      );
      pass.end();
    } else {
      const pass = t.beginSimpleRenderPass(encoder, t.createTestTexture().createView());
      pass.setBindGroup(0, bindGroup);
      pass.end();
    }

    t.expectValidationError(() => {
      encoder.finish();
    }, secondUseConflicts);
  });

g.test('shader_stages_and_visibility,attachment_write')
  .desc(
    `
    Test that stage visibility doesn't affect resource usage validation.
    - Use a texture as sampled, with 'readVisibility' {0,VERTEX,FRAGMENT,COMPUTE}
    - Use a {same,different} texture as a render pass attachment

    There should be a validation error IFF the same texture was used.
  `
  )
  .params(u =>
    u
      .beginSubcases()
      .combine('secondUseConflicts', [false, true])
      .combine('readVisibility', [
        0,
        GPUConst.ShaderStage.VERTEX,
        GPUConst.ShaderStage.FRAGMENT,
        GPUConst.ShaderStage.COMPUTE,
      ])
      .combine('readEntry', [
        { texture: { sampleType: 'unfilterable-float' } },
        { storageTexture: { access: 'read-only', format: 'r32float' } },
      ] as const)
  )
  .fn(t => {
    const { readVisibility, readEntry, secondUseConflicts } = t.params;

    t.skipIfNeedStorageTexturesByVisibilityAndNoStorageTextures(readVisibility);

    const usage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.STORAGE_BINDING;

    const view = t.createTestTexture({ usage }).createView();
    const view2 = secondUseConflicts ? view : t.createTestTexture({ usage }).createView();
    const bgl = t.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: readVisibility, ...readEntry }],
    });
    const bindGroup = t.device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: view }],
    });

    const encoder = t.device.createCommandEncoder();
    const pass = t.beginSimpleRenderPass(encoder, view2);
    pass.setBindGroup(0, bindGroup);
    pass.end();

    // Texture usages in bindings with invisible shader stages should be validated. Invisible shader
    // stages include shader stage with visibility none, compute shader stage in render pass, and
    // vertex/fragment shader stage in compute pass.
    t.expectValidationError(() => {
      encoder.finish();
    }, secondUseConflicts);
  });

g.test('replaced_binding')
  .desc(
    `
    Test whether a binding that's been replaced by another setBindGroup call can still
    cause validation to fail (with a write/write conflict).
      - In render pass, all setBindGroup calls contribute to the validation even if they're
        shadowed.
      - In compute pass, only the bindings visible at dispatchWorkgroups() contribute to validation.
  `
  )
  .params(u =>
    u
      .combine('compute', [false, true])
      .combine('callDrawOrDispatch', [false, true])
      .combine('entry', [
        { texture: { sampleType: 'unfilterable-float' } },
        { storageTexture: { access: 'read-only', format: 'r32float' } },
        { storageTexture: { access: 'write-only', format: 'r32float' } },
        { storageTexture: { access: 'read-write', format: 'r32float' } },
      ] as const)
  )
  .fn(t => {
    const { compute, callDrawOrDispatch, entry } = t.params;

    t.skipIfNeedStorageTexturesByVisibilityAndNoStorageTextures(GPUShaderStage.FRAGMENT);

    const sampledView = t.createTestTexture().createView();
    const sampledStorageView = t
      .createTestTexture({
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      })
      .createView();

    // Create bindGroup0. It has two bindings. These two bindings use different views/subresources.
    const bglEntries0: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'unfilterable-float' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        ...entry,
      },
    ];
    const bgEntries0: GPUBindGroupEntry[] = [
      { binding: 0, resource: sampledView },
      { binding: 1, resource: sampledStorageView },
    ];
    const bindGroup0 = t.device.createBindGroup({
      entries: bgEntries0,
      layout: t.device.createBindGroupLayout({ entries: bglEntries0 }),
    });

    // Create bindGroup1. It has one binding, which use the same view/subresource of a binding in
    // bindGroup0. So it may or may not conflicts with that binding in bindGroup0.
    const bindGroup1 = t.createBindGroup(0, sampledStorageView, 'sampled-texture', '2d', {
      sampleType: 'unfilterable-float',
    });

    const encoder = t.device.createCommandEncoder();
    const pass = compute
      ? encoder.beginComputePass()
      : t.beginSimpleRenderPass(encoder, t.createTestTexture().createView());

    // Set bindGroup0 and bindGroup1. bindGroup0 is replaced by bindGroup1 in the current pass.
    // But bindings in bindGroup0 should be validated too.
    pass.setBindGroup(0, bindGroup0);
    if (callDrawOrDispatch) {
      const pipeline = compute
        ? vtu.createNoOpComputePipeline(t)
        : vtu.createNoOpRenderPipeline(t, 'auto', 'r32float');
      t.setPipeline(pass, pipeline);
      t.issueDrawOrDispatch(pass);
    }
    pass.setBindGroup(0, bindGroup1);
    pass.end();

    // MAINTENANCE_TODO: If the Compatible Usage List
    // (https://gpuweb.github.io/gpuweb/#compatible-usage-list) gets programmatically defined in
    // capability_info, use it here, instead of this logic, for clarity.
    let success =
      entry.storageTexture?.access !== 'write-only' &&
      entry.storageTexture?.access !== 'read-write';
    // Replaced bindings should not be validated in compute pass, because validation only occurs
    // inside dispatchWorkgroups() which only looks at the current resource usages.
    success ||= compute;

    t.expectValidationError(() => {
      encoder.finish();
    }, !success);
  });

g.test('bindings_in_bundle')
  .desc(
    `
    Test the texture usages in bundles by using two bindings of the same texture with various
    combination of {sampled, storage, render target} usages.
  `
  )
  .params(u =>
    u
      .combine('type0', ['render-target', ...kTextureBindingTypes] as const)
      .combine('type1', ['render-target', ...kTextureBindingTypes] as const)
      .beginSubcases()
      .combine('binding0InBundle', [false, true])
      .combine('binding1InBundle', [false, true])
      .expandWithParams(function* ({ type0, type1 }) {
        const usageForType = (type: typeof type0 | typeof type1) => {
          switch (type) {
            case 'multisampled-texture':
            case 'sampled-texture':
              return 'TEXTURE_BINDING' as const;
            case 'readonly-storage-texture':
            case 'writeonly-storage-texture':
            case 'readwrite-storage-texture':
              return 'STORAGE_BINDING' as const;
            case 'render-target':
              return 'RENDER_ATTACHMENT' as const;
          }
        };

        yield {
          _usage0: usageForType(type0),
          _usage1: usageForType(type1),
          _sampleCount:
            type0 === 'multisampled-texture' || type1 === 'multisampled-texture'
              ? (4 as const)
              : undefined,
        };
      })
      .unless(
        p =>
          // We can't set 'render-target' in bundle, so we need to exclude it from bundle.
          // In addition, if both bindings are non-bundle, there is no need to test it because
          // we have far more comprehensive test cases for that situation in this file.
          (p.binding0InBundle && p.type0 === 'render-target') ||
          (p.binding1InBundle && p.type1 === 'render-target') ||
          (!p.binding0InBundle && !p.binding1InBundle) ||
          // Storage textures can't be multisampled.
          (p._sampleCount !== undefined &&
            p._sampleCount > 1 &&
            (p._usage0 === 'STORAGE_BINDING' || p._usage1 === 'STORAGE_BINDING')) ||
          // If both are sampled, we create two views of the same texture, so both must be
          // multisampled.
          (p.type0 === 'multisampled-texture' && p.type1 === 'sampled-texture') ||
          (p.type0 === 'sampled-texture' && p.type1 === 'multisampled-texture')
      )
  )
  .fn(t => {
    const { binding0InBundle, binding1InBundle, type0, type1, _usage0, _usage1, _sampleCount } =
      t.params;

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(type0, GPUShaderStage.FRAGMENT);
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(type1, GPUShaderStage.FRAGMENT);
    if (_sampleCount! > 1) {
      t.skipIfTextureFormatNotMultisampled('r32float');
    }

    // Two bindings are attached to the same texture view.
    const usage =
      _sampleCount === 4
        ? GPUTextureUsage[_usage0] | GPUTextureUsage[_usage1] | GPUTextureUsage.RENDER_ATTACHMENT
        : GPUTextureUsage[_usage0] | GPUTextureUsage[_usage1];
    const view = t
      .createTestTexture({
        usage,
        sampleCount: _sampleCount,
      })
      .createView();

    const bindGroups: GPUBindGroup[] = [];
    if (type0 !== 'render-target') {
      const binding0TexFormat = type0 === 'sampled-texture' ? undefined : 'r32float';
      bindGroups[0] = t.createBindGroup(0, view, type0, '2d', {
        format: binding0TexFormat,
        sampleType: 'unfilterable-float',
      });
    }
    if (type1 !== 'render-target') {
      const binding1TexFormat = type1 === 'sampled-texture' ? undefined : 'r32float';
      bindGroups[1] = t.createBindGroup(1, view, type1, '2d', {
        format: binding1TexFormat,
        sampleType: 'unfilterable-float',
      });
    }

    const encoder = t.device.createCommandEncoder();
    // At least one binding is in bundle, which means that its type is not 'render-target'.
    // As a result, only one binding's type is 'render-target' at most.
    const pass = t.beginSimpleRenderPass(
      encoder,
      type0 === 'render-target' || type1 === 'render-target'
        ? view
        : t.createTestTexture().createView()
    );

    const bindingsInBundle: boolean[] = [binding0InBundle, binding1InBundle];
    for (let i = 0; i < 2; i++) {
      // Create a bundle for each bind group if its bindings is required to be in bundle on purpose.
      // Otherwise, call setBindGroup directly in pass if needed (when its binding is not
      // 'render-target').
      if (bindingsInBundle[i]) {
        const bundleEncoder = t.device.createRenderBundleEncoder({
          colorFormats: ['r32float'],
        });
        bundleEncoder.setBindGroup(i, bindGroups[i]);
        const bundleInPass = bundleEncoder.finish();
        pass.executeBundles([bundleInPass]);
      } else if (bindGroups[i] !== undefined) {
        pass.setBindGroup(i, bindGroups[i]);
      }
    }

    pass.end();

    const isReadOnly = (t: typeof type0 | typeof type1) => {
      switch (t) {
        case 'sampled-texture':
        case 'multisampled-texture':
        case 'readonly-storage-texture':
          return true;
        default:
          return false;
      }
    };

    let success = false;
    if (isReadOnly(type0) && isReadOnly(type1)) {
      success = true;
    }

    // Writable storage textures (write-only and read-write storage textures) cannot be aliased.
    if (type0 === type1) {
      success = true;
    }

    // Resource usages in bundle should be validated.
    t.expectValidationError(() => {
      encoder.finish();
    }, !success);
  });

g.test('unused_bindings_in_pipeline')
  .desc(
    `
    Test that for compute pipelines with 'auto' layout, only bindings used by the pipeline count
    toward the usage scope. For render passes, test the pipeline doesn't matter because only the
    calls to setBindGroup count toward the usage scope.
  `
  )
  .params(u =>
    u
      .combine('compute', [false, true])
      .combine('readOnlyUsage', ['sampled-texture', 'readonly-storage-texture'] as const)
      .combine('writableUsage', ['writeonly-storage-texture', 'readwrite-storage-texture'] as const)
      .combine('useBindGroup0', [false, true])
      .combine('useBindGroup1', [false, true])
      .combine('setBindGroupsOrder', ['common', 'reversed'] as const)
      .combine('setPipeline', ['before', 'middle', 'after', 'none'] as const)
      .combine('callDrawOrDispatch', [false, true])
  )
  .fn(t => {
    const {
      compute,
      readOnlyUsage,
      writableUsage,
      useBindGroup0,
      useBindGroup1,
      setBindGroupsOrder,
      setPipeline,
      callDrawOrDispatch,
    } = t.params;
    if (writableUsage === 'readwrite-storage-texture') {
      t.skipIfLanguageFeatureNotSupported('readonly_and_readwrite_storage_textures');
    }

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(
      readOnlyUsage,
      GPUShaderStage.FRAGMENT
    );
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(
      writableUsage,
      GPUShaderStage.FRAGMENT
    );

    const view = t
      .createTestTexture({
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      })
      .createView();
    const bindGroup0 = t.createBindGroup(0, view, readOnlyUsage, '2d', {
      sampleType: 'unfilterable-float',
      format: 'r32float',
    });
    const bindGroup1 = t.createBindGroup(0, view, writableUsage, '2d', {
      format: 'r32float',
    });

    const writeAccess = writableUsage === 'writeonly-storage-texture' ? 'write' : 'read_write';
    const wgslVertex = `@vertex fn main() -> @builtin(position) vec4<f32> {
  return vec4<f32>();
}`;
    const wgslFragment = pp`
      ${pp._if(useBindGroup0)}
      @group(0) @binding(0) var image0 : texture_storage_2d<r32float, ${writeAccess}>;
      ${pp._endif}
      ${pp._if(useBindGroup1)}
      @group(1) @binding(0) var image1 : texture_storage_2d<r32float, ${writeAccess}>;
      ${pp._endif}
      @fragment fn main() {}
    `;

    const wgslCompute = pp`
      ${pp._if(useBindGroup0)}
      @group(0) @binding(0) var image0 : texture_storage_2d<r32float, ${writeAccess}>;
      ${pp._endif}
      ${pp._if(useBindGroup1)}
      @group(1) @binding(0) var image1 : texture_storage_2d<r32float, ${writeAccess}>;
      ${pp._endif}
      @compute @workgroup_size(1) fn main() {}
    `;

    const pipeline = compute
      ? t.device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: t.device.createShaderModule({
              code: wgslCompute,
            }),
            entryPoint: 'main',
          },
        })
      : t.device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module: t.device.createShaderModule({
              code: wgslVertex,
            }),
            entryPoint: 'main',
          },
          fragment: {
            module: t.device.createShaderModule({
              code: wgslFragment,
            }),
            entryPoint: 'main',
            targets: [{ format: 'r32float', writeMask: 0 }],
          },
          primitive: { topology: 'triangle-list' },
        });

    const encoder = t.device.createCommandEncoder();
    const pass = compute
      ? encoder.beginComputePass()
      : encoder.beginRenderPass({
          colorAttachments: [
            {
              view: t.createTestTexture().createView(),
              clearValue: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });
    const index0 = setBindGroupsOrder === 'common' ? 0 : 1;
    const index1 = setBindGroupsOrder === 'common' ? 1 : 0;
    if (setPipeline === 'before') t.setPipeline(pass, pipeline);
    pass.setBindGroup(index0, bindGroup0);
    if (setPipeline === 'middle') t.setPipeline(pass, pipeline);
    pass.setBindGroup(index1, bindGroup1);
    if (setPipeline === 'after') t.setPipeline(pass, pipeline);
    if (callDrawOrDispatch) t.issueDrawOrDispatch(pass);
    pass.end();

    // Resource usage validation scope is defined by the whole render pass or by dispatch calls.
    // Regardless of whether or not dispatch is called, in a compute pass, we always succeed
    // because in this test, none of the bindings are used by the pipeline.
    // In a render pass, we always fail because usage is based on any bindings used in the
    // render pass, regardless of whether the pipeline uses them.
    let success = compute;

    // Also fails if we try to draw/dispatch without a pipeline.
    if (callDrawOrDispatch && setPipeline === 'none') {
      success = false;
    }

    t.expectValidationError(() => {
      encoder.finish();
    }, !success);
  });

g.test('scope,dispatch')
  .desc(
    `
    Tests that in a compute pass, no usage validation occurs without a dispatch call.
    {Sets,skips} each of two conflicting bind groups in a pass {with,without} a dispatch call.
    If both are set, AND there is a dispatch call, validation should fail.
  `
  )
  .params(u =>
    u
      .combine('dispatch', ['none', 'direct', 'indirect'])
      .expandWithParams(
        p =>
          [
            { usage1: 'sampled-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'sampled-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'writeonly-storage-texture', usage2: 'readwrite-storage-texture' },
          ] as const
      )
      .beginSubcases()
      .expand('setBindGroup0', p => (p.dispatch ? [true] : [false, true]))
      .expand('setBindGroup1', p => (p.dispatch ? [true] : [false, true]))
  )
  .fn(t => {
    const { dispatch, usage1, usage2, setBindGroup0, setBindGroup1 } = t.params;

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage1, GPUShaderStage.FRAGMENT);
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage2, GPUShaderStage.FRAGMENT);

    const { bindGroup0, bindGroup1, encoder, pass, pipeline } = t.testValidationScope(
      true,
      usage1,
      usage2
    );
    assert(pass instanceof GPUComputePassEncoder);
    t.setPipeline(pass, pipeline);

    if (setBindGroup0) pass.setBindGroup(0, bindGroup0);
    if (setBindGroup1) pass.setBindGroup(1, bindGroup1);

    switch (dispatch) {
      case 'direct':
        pass.dispatchWorkgroups(1);
        break;
      case 'indirect':
        {
          const indirectBuffer = t.createBufferTracked({ size: 4, usage: GPUBufferUsage.INDIRECT });
          pass.dispatchWorkgroupsIndirect(indirectBuffer, 0);
        }
        break;
    }

    pass.end();

    t.expectValidationError(
      () => {
        encoder.finish();
      },
      dispatch !== 'none' && setBindGroup0 && setBindGroup1
    );
  });

g.test('scope,basic,render')
  .desc(
    `
    Tests that in a render pass, validation occurs even without a pipeline or draw call.
    {Set,skip} each of two conflicting bind groups. If both are set, validation should fail.
  `
  )
  .paramsSubcasesOnly(u =>
    u //
      .combine('setBindGroup0', [false, true])
      .combine('setBindGroup1', [false, true])
      .expandWithParams(
        p =>
          [
            { usage1: 'sampled-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'sampled-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'writeonly-storage-texture', usage2: 'readwrite-storage-texture' },
          ] as const
      )
  )
  .fn(t => {
    const { setBindGroup0, setBindGroup1, usage1, usage2 } = t.params;

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage1, GPUShaderStage.FRAGMENT);
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage2, GPUShaderStage.FRAGMENT);

    const { bindGroup0, bindGroup1, encoder, pass } = t.testValidationScope(false, usage1, usage2);
    assert(pass instanceof GPURenderPassEncoder);

    if (setBindGroup0) pass.setBindGroup(0, bindGroup0);
    if (setBindGroup1) pass.setBindGroup(1, bindGroup1);

    pass.end();

    t.expectValidationError(() => {
      encoder.finish();
    }, setBindGroup0 && setBindGroup1);
  });

g.test('scope,pass_boundary,compute')
  .desc(
    `
    Test using two conflicting bind groups in separate dispatch calls, {with,without} a pass
    boundary in between. This should always be valid.
    `
  )
  .paramsSubcasesOnly(u =>
    u.combine('splitPass', [false, true]).expandWithParams(
      p =>
        [
          { usage1: 'sampled-texture', usage2: 'writeonly-storage-texture' },
          { usage1: 'sampled-texture', usage2: 'readwrite-storage-texture' },
          { usage1: 'readonly-storage-texture', usage2: 'writeonly-storage-texture' },
          { usage1: 'readonly-storage-texture', usage2: 'readwrite-storage-texture' },
          { usage1: 'writeonly-storage-texture', usage2: 'readwrite-storage-texture' },
        ] as const
    )
  )
  .fn(t => {
    const { splitPass, usage1, usage2 } = t.params;

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage1, GPUShaderStage.FRAGMENT);
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage2, GPUShaderStage.FRAGMENT);

    const { bindGroupLayouts, bindGroups } = t.makeTwoBindGroupsWithOneTextureView(usage1, usage2);

    const encoder = t.device.createCommandEncoder();

    const pipelineUsingBG0 = vtu.createNoOpComputePipeline(
      t,
      t.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts[0]],
      })
    );
    const pipelineUsingBG1 = vtu.createNoOpComputePipeline(
      t,
      t.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts[1]],
      })
    );

    let pass = encoder.beginComputePass();
    pass.setPipeline(pipelineUsingBG0);
    pass.setBindGroup(0, bindGroups[0]);
    pass.dispatchWorkgroups(1);
    if (splitPass) {
      pass.end();
      pass = encoder.beginComputePass();
    }
    pass.setPipeline(pipelineUsingBG1);
    pass.setBindGroup(0, bindGroups[1]);
    pass.dispatchWorkgroups(1);
    pass.end();

    // Always valid
    encoder.finish();
  });

g.test('scope,pass_boundary,render')
  .desc(
    `
    Test using two conflicting bind groups in separate draw calls, {with,without} a pass
    boundary in between. This should be valid only if there is a pass boundary.
    `
  )
  .paramsSubcasesOnly(u =>
    u //
      .combine('splitPass', [false, true])
      .combine('draw', [false, true])
      .expandWithParams(
        p =>
          [
            { usage1: 'sampled-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'sampled-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'writeonly-storage-texture' },
            { usage1: 'readonly-storage-texture', usage2: 'readwrite-storage-texture' },
            { usage1: 'writeonly-storage-texture', usage2: 'readwrite-storage-texture' },
          ] as const
      )
  )
  .fn(t => {
    const { splitPass, draw, usage1, usage2 } = t.params;

    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage1, GPUShaderStage.FRAGMENT);
    t.skipIfNeedStorageTexturesByResourceTypeAndNoStorageTextures(usage2, GPUShaderStage.FRAGMENT);

    const { bindGroupLayouts, bindGroups } = t.makeTwoBindGroupsWithOneTextureView(usage1, usage2);

    const encoder = t.device.createCommandEncoder();

    const pipelineUsingBG0 = vtu.createNoOpRenderPipeline(
      t,
      t.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts[0]],
      }),
      'r32float'
    );
    const pipelineUsingBG1 = vtu.createNoOpRenderPipeline(
      t,
      t.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayouts[1]],
      }),
      'r32float'
    );

    const attachment = t.createTestTexture().createView();

    let pass = t.beginSimpleRenderPass(encoder, attachment);
    pass.setPipeline(pipelineUsingBG0);
    pass.setBindGroup(0, bindGroups[0]);
    if (draw) pass.draw(3);
    if (splitPass) {
      pass.end();
      pass = t.beginSimpleRenderPass(encoder, attachment);
    }
    pass.setPipeline(pipelineUsingBG1);
    pass.setBindGroup(0, bindGroups[1]);
    if (draw) pass.draw(3);
    pass.end();

    t.expectValidationError(() => {
      encoder.finish();
    }, !splitPass);
  });
