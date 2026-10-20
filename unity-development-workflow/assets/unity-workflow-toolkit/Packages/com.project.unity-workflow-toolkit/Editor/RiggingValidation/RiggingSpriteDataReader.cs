using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.U2D;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 保存一个 Sprite 的运行时网格和只读 Skinning Editor 网格快照。
    /// </summary>
    internal sealed class RiggingSpriteData
    {
        /// <summary>创建只读 Sprite 网格快照。</summary>
        /// <param name="sprite">已导入的 Sprite 资源。</param>
        /// <param name="bones">Skinning Editor 中保存的骨骼列表。</param>
        /// <param name="vertices">Skinning Editor 中的顶点和权重。</param>
        /// <param name="indices">Skinning Editor 中的网格索引。</param>
        /// <param name="runtimeBones">Sprite 运行时骨骼列表。</param>
        /// <param name="runtimeVertices">Sprite 运行时顶点。</param>
        /// <param name="runtimeTriangles">Sprite 运行时三角形索引。</param>
        /// <param name="bindPoses">Sprite 运行时 bind pose 矩阵。</param>
        public RiggingSpriteData(
            Sprite sprite,
            List<SpriteBone> bones,
            Vertex2DMetaData[] vertices,
            int[] indices,
            SpriteBone[] runtimeBones,
            Vector3[] runtimeVertices,
            ushort[] runtimeTriangles,
            Matrix4x4[] bindPoses,
            Vector2 authoringPivotOffset,
            float authoringToRuntimeScale)
        {
            Sprite = sprite;
            Bones = bones ?? new List<SpriteBone>();
            Vertices = vertices ?? Array.Empty<Vertex2DMetaData>();
            Indices = indices ?? Array.Empty<int>();
            RuntimeBones = runtimeBones ?? Array.Empty<SpriteBone>();
            RuntimeVertices = runtimeVertices ?? Array.Empty<Vector3>();
            RuntimeTriangles = runtimeTriangles ?? Array.Empty<ushort>();
            BindPoses = bindPoses ?? Array.Empty<Matrix4x4>();
            AuthoringPivotOffset = authoringPivotOffset;
            AuthoringToRuntimeScale = authoringToRuntimeScale;
        }

        /// <summary>获取原始 Sprite。</summary>
        public Sprite Sprite { get; }

        /// <summary>获取 Skinning Editor 中按顺序保存的骨骼。</summary>
        public List<SpriteBone> Bones { get; }

        /// <summary>获取 Skinning Editor 网格顶点和权重。</summary>
        public Vertex2DMetaData[] Vertices { get; }

        /// <summary>获取 Skinning Editor 网格索引。</summary>
        public int[] Indices { get; }

        /// <summary>获取 Sprite 运行时骨骼副本。</summary>
        public SpriteBone[] RuntimeBones { get; }

        /// <summary>获取 Sprite 运行时顶点副本。</summary>
        public Vector3[] RuntimeVertices { get; }

        /// <summary>获取 Sprite 运行时三角形副本。</summary>
        public ushort[] RuntimeTriangles { get; }

        /// <summary>获取 Sprite 运行时 bind pose 矩阵副本。</summary>
        public Matrix4x4[] BindPoses { get; }

        /// <summary>获取 Sprite Editor 顶点换算到局部坐标前需减去的 Pivot 偏移。</summary>
        public Vector2 AuthoringPivotOffset { get; }

        /// <summary>获取 Sprite Editor 像素坐标到运行时 Sprite 局部坐标的比例。</summary>
        public float AuthoringToRuntimeScale { get; }
    }

    /// <summary>
    /// 通过 Unity 公开的 Sprite Data Provider API 读取编辑器权重，并与运行时网格核对。
    /// </summary>
    internal static class RiggingSpriteDataReader
    {
        /// <summary>从已导入 Sprite 读取编辑器和运行时骨骼网格快照。</summary>
        /// <param name="sprite">待读取的 Sprite。</param>
        /// <param name="data">读取成功时返回的不可变快照。</param>
        /// <param name="error">读取失败时的人类可读原因。</param>
        /// <returns>全部公开数据源均可读取时返回 true。</returns>
        public static bool TryRead(Sprite sprite, out RiggingSpriteData data, out string error)
        {
            data = null;
            error = string.Empty;
            if (sprite == null)
            {
                error = "Sprite 引用为空。";
                return false;
            }

            try
            {
                string assetPath = AssetDatabase.GetAssetPath(sprite);
                if (!RiggingValidationRequestValidator.TryValidateAssetPath(assetPath, null, out assetPath))
                {
                    error = "Sprite 资源不位于项目 Assets/ 目录。";
                    return false;
                }

                AssetImporter importer = AssetImporter.GetAtPath(assetPath);
                if (importer == null)
                {
                    error = "Sprite 资源没有可读取的 AssetImporter。";
                    return false;
                }

                SpriteDataProviderFactories factories = new SpriteDataProviderFactories();
                factories.Init();
                ISpriteEditorDataProvider provider = factories.GetSpriteEditorDataProviderFromObject(importer);
                if (provider == null)
                {
                    error = "Unity 没有为 Sprite 资源提供 Skinning Editor 数据接口。";
                    return false;
                }

                provider.InitSpriteEditorDataProvider();
                SpriteRect[] spriteRects = provider.GetSpriteRects() ?? Array.Empty<SpriteRect>();
                SpriteRect[] matchingRects = spriteRects
                    .Where(rect => rect != null && string.Equals(rect.name, sprite.name, StringComparison.Ordinal))
                    .ToArray();
                if (matchingRects.Length != 1)
                {
                    error = $"资源中的 Sprite 子资源名称 {sprite.name} 对应 {matchingRects.Length} 个 SpriteRect，无法唯一读取骨骼数据。";
                    return false;
                }

                ISpriteBoneDataProvider boneProvider = provider.GetDataProvider<ISpriteBoneDataProvider>();
                ISpriteMeshDataProvider meshProvider = provider.GetDataProvider<ISpriteMeshDataProvider>();
                ITextureDataProvider textureProvider = provider.GetDataProvider<ITextureDataProvider>();
                if (boneProvider == null || meshProvider == null || textureProvider == null)
                {
                    error = "Sprite 导入器未暴露骨骼、网格或纹理尺寸数据接口。";
                    return false;
                }

                GUID spriteId = matchingRects[0].spriteID;
                SpriteRect spriteRect = matchingRects[0];
                List<SpriteBone> bones = boneProvider.GetBones(spriteId) ?? new List<SpriteBone>();
                Vertex2DMetaData[] vertices = meshProvider.GetVertices(spriteId) ?? Array.Empty<Vertex2DMetaData>();
                int[] indices = meshProvider.GetIndices(spriteId) ?? Array.Empty<int>();
                int actualWidth;
                int actualHeight;
                textureProvider.GetTextureActualWidthAndHeight(out actualWidth, out actualHeight);
                Texture2D runtimeTexture = sprite.texture;
                Vector2 rectSize = new Vector2(spriteRect.rect.width, spriteRect.rect.height);
                Vector2 authoringPivotOffset = Vector2.Scale(rectSize, spriteRect.pivot);
                float definitionScale = 0f;
                if (runtimeTexture != null && actualWidth > 0 && actualHeight > 0)
                {
                    // SpritePostProcess 使用导入纹理尺寸与源纹理尺寸的最小比例缩放编辑器像素坐标。
                    definitionScale = Mathf.Min(runtimeTexture.width / (float)actualWidth,
                        runtimeTexture.height / (float)actualHeight);
                }

                float authoringToRuntimeScale = definitionScale / sprite.pixelsPerUnit;
                if (!IsFinite(rectSize) || rectSize.x <= 0f || rectSize.y <= 0f ||
                    !IsFinite(spriteRect.pivot) || !IsFinite(authoringPivotOffset) ||
                    !IsFinite(authoringToRuntimeScale) || authoringToRuntimeScale <= 0f)
                {
                    error = "Sprite Rect、Pivot、PPU 或纹理缩放信息无效，无法换算网格顶点坐标。";
                    return false;
                }

                SpriteBone[] runtimeBones = sprite.GetBones() ?? Array.Empty<SpriteBone>();
                var runtimePositionSlice = SpriteDataAccessExtensions.GetVertexAttribute<Vector3>(sprite, VertexAttribute.Position);
                Vector3[] runtimeVertices = new Vector3[runtimePositionSlice.Length];
                for (int index = 0; index < runtimePositionSlice.Length; index++)
                {
                    runtimeVertices[index] = runtimePositionSlice[index];
                }

                ushort[] runtimeTriangles = sprite.triangles ?? Array.Empty<ushort>();
                var runtimeBindPoseSlice = sprite.GetBindPoses();
                Matrix4x4[] bindPoses = new Matrix4x4[runtimeBindPoseSlice.Length];
                for (int index = 0; index < runtimeBindPoseSlice.Length; index++)
                {
                    bindPoses[index] = runtimeBindPoseSlice[index];
                }

                data = new RiggingSpriteData(sprite, bones, vertices, indices, runtimeBones,
                    runtimeVertices, runtimeTriangles, bindPoses, authoringPivotOffset, authoringToRuntimeScale);
                return true;
            }
            catch (Exception)
            {
                error = "Unity 无法通过公开 Sprite 数据接口读取骨骼网格信息。";
                return false;
            }
        }

        /// <summary>检查纹理坐标换算所需向量是否有限。</summary>
        /// <param name="value">待检查坐标。</param>
        /// <returns>两个分量均为有限值时返回 true。</returns>
        private static bool IsFinite(Vector2 value)
        {
            return IsFinite(value.x) && IsFinite(value.y);
        }

        /// <summary>检查纹理坐标换算所需浮点数是否有限。</summary>
        /// <param name="value">待检查数值。</param>
        /// <returns>数值不是 NaN 或无穷值时返回 true。</returns>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
