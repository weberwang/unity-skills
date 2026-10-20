using System;
using System.Collections.Generic;
using Project.UnityWorkflow.Core.Models;
using UnityEditor.U2D.Sprites;
using UnityEngine;
using UnityEngine.U2D;
using UnityEngine.U2D.Animation;

namespace Project.UnityWorkflow.RiggingValidation
{
    /// <summary>
    /// 校验 Sprite 的三角网格、权重、bind pose 以及 SpriteSkin 的骨骼绑定。
    /// </summary>
    internal static class RiggingSpriteMeshValidator
    {
        private const float WeightSumTolerance = 0.001f;
        private const double TriangleAreaTolerance = 0.00000001d;

        /// <summary>读取 Sprite 数据并逐项验证网格、骨骼和 bind pose。</summary>
        /// <param name="sprite">待验证的 Sprite。</param>
        /// <param name="checkPrefix">本次验证使用的稳定检查 ID 前缀。</param>
        /// <param name="report">接收结果的质量报告。</param>
        /// <returns>读取成功的 Sprite 快照；读取失败时返回 null。</returns>
        public static RiggingSpriteData ValidateSprite(Sprite sprite, string checkPrefix, QualityReportDto report)
        {
            if (!RiggingSpriteDataReader.TryRead(sprite, out RiggingSpriteData data, out string readError))
            {
                RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-sprite-data", "rigging", "FAIL", readError);
                AddBlockedMeshChecks(checkPrefix, report, "Sprite 网格数据读取失败。");
                return null;
            }

            bool boneDataValid = ValidateBoneData(data);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bones", "rigging",
                boneDataValid ? "PASS" : "FAIL",
                boneDataValid
                    ? $"Sprite 编辑器和运行时骨骼数据一致，共 {data.Bones.Count} 根骨骼。"
                    : "Sprite 必须含有效且唯一的骨骼；编辑器与运行时的骨骼名称、顺序和父级元数据必须一致。");

            bool topologyValid = ValidateTopology(data);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-mesh-topology", "rigging",
                topologyValid ? "PASS" : "FAIL",
                topologyValid
                    ? $"网格包含 {data.Vertices.Length} 个有限顶点和 {data.Indices.Length / 3} 个有效三角形。"
                    : "Sprite 网格缺少顶点或三角形，顶点来源不一致，或存在非有限、退化、索引越界的几何数据。");

            bool weightsValid = ValidateWeights(data);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bone-weights", "rigging",
                weightsValid ? "PASS" : "FAIL",
                weightsValid
                    ? $"已验证 {data.Vertices.Length} 个顶点的权重非负、有限、归一化且有效骨骼索引均在范围内。"
                    : "至少一个顶点含负值、非有限、未归一化权重，或四个槽位中存在无效骨骼索引。");

            bool bindPosesValid = ValidateBindPoses(data);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bind-poses", "rigging",
                bindPosesValid ? "PASS" : "FAIL",
                bindPosesValid
                    ? $"{data.BindPoses.Length} 个 bind pose 与骨骼数量匹配且矩阵值有限。"
                    : "Bind pose 缺失、数量与骨骼不匹配，或矩阵包含非有限值。");

            return data;
        }

        /// <summary>验证 SpriteSkin 的根骨、Transform 数组顺序、唯一性和父子层级。</summary>
        /// <param name="skin">待验证的 SpriteSkin。</param>
        /// <param name="characterRoot">角色 Prefab 根节点。</param>
        /// <param name="data">该 SpriteSkin 当前 Sprite 的骨骼数据。</param>
        /// <param name="checkPrefix">本次验证使用的稳定检查 ID 前缀。</param>
        /// <param name="report">接收结果的质量报告。</param>
        /// <param name="requireRendererSpriteMatch">变体检查时设为 false，避免为校验而实际切换 SpriteRenderer。</param>
        /// <returns>根骨和所有骨骼 Transform 均正确映射时返回 true。</returns>
        public static bool ValidateSkinMapping(
            SpriteSkin skin,
            GameObject characterRoot,
            RiggingSpriteData data,
            string checkPrefix,
            QualityReportDto report,
            bool requireRendererSpriteMatch = true)
        {
            if (skin == null || characterRoot == null || data == null)
            {
                RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-skin-mapping", "rigging", "FAIL",
                    "SpriteSkin、角色根节点或 Sprite 骨骼数据为空。");
                return false;
            }

            SpriteRenderer renderer = skin.GetComponent<SpriteRenderer>();
            Transform rootBone = skin.rootBone;
            Transform[] transforms = skin.boneTransforms ?? Array.Empty<Transform>();
            SpriteBone[] bones = data.RuntimeBones;
            bool valid = renderer != null && (!requireRendererSpriteMatch || renderer.sprite == data.Sprite) &&
                         rootBone != null && IsWithinRoot(rootBone, characterRoot.transform) &&
                         transforms.Length == bones.Length && transforms.Length > 0;
            HashSet<Transform> uniqueTransforms = new HashSet<Transform>();
            int rootBoneIndex = -1;

            for (int index = 0; index < bones.Length; index++)
            {
                SpriteBone bone = bones[index];
                Transform boneTransform = index < transforms.Length ? transforms[index] : null;
                int parentId = bone.parentId;
                bool parentValid = parentId >= -1 && parentId < bones.Length && parentId != index;
                if (parentId < 0)
                {
                    if (rootBoneIndex >= 0)
                    {
                        valid = false;
                    }

                    rootBoneIndex = index;
                }

                bool transformValid = boneTransform != null && IsWithinRoot(boneTransform, characterRoot.transform) &&
                                      uniqueTransforms.Add(boneTransform) &&
                                      string.Equals(boneTransform.name, bone.name, StringComparison.Ordinal);
                if (parentId >= 0 && parentValid && parentId < transforms.Length &&
                    boneTransform != null && transforms[parentId] != null)
                {
                    transformValid &= boneTransform.parent == transforms[parentId];
                }
                else if (parentId >= 0)
                {
                    transformValid = false;
                }

                valid &= parentValid && transformValid;
            }

            valid &= rootBoneIndex >= 0 && rootBone != null && rootBoneIndex < transforms.Length &&
                     rootBone == transforms[rootBoneIndex] && HasAcyclicParents(bones);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-skin-mapping", "rigging",
                valid ? "PASS" : "FAIL",
                valid
                    ? $"SpriteSkin 根骨和 {transforms.Length} 个骨骼 Transform 按 Sprite 骨骼顺序唯一映射，父级关系有效。"
                    : "SpriteSkin 必须引用角色内 SpriteRenderer、角色层级内唯一根骨和按 Sprite 骨骼顺序一一对应的唯一 Transform；名称、父级或引用无效。");
            return valid;
        }

        /// <summary>比较两个 Sprite 的骨架结构签名，不比较像素或轮廓。</summary>
        /// <param name="source">角色当前 Sprite 的数据。</param>
        /// <param name="variant">待检查变体 Sprite 的数据。</param>
        /// <returns>两份骨架顺序、名称及父级元数据相同时返回 true。</returns>
        public static bool HasCompatibleSkeleton(RiggingSpriteData source, RiggingSpriteData variant)
        {
            if (source == null || variant == null || source.RuntimeBones.Length == 0 ||
                source.RuntimeBones.Length != variant.RuntimeBones.Length)
            {
                return false;
            }

            for (int index = 0; index < source.RuntimeBones.Length; index++)
            {
                SpriteBone left = source.RuntimeBones[index];
                SpriteBone right = variant.RuntimeBones[index];
                if (!string.Equals(left.name, right.name, StringComparison.Ordinal) ||
                    left.parentId != right.parentId)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>核对编辑器骨骼与运行时骨骼的顺序、名称和父级数据。</summary>
        /// <param name="data">Sprite 数据快照。</param>
        /// <returns>骨骼数据结构有效时返回 true。</returns>
        private static bool ValidateBoneData(RiggingSpriteData data)
        {
            if (data.Bones.Count == 0 || data.Bones.Count != data.RuntimeBones.Length)
            {
                return false;
            }

            HashSet<string> nonEmptyGuids = new HashSet<string>(StringComparer.Ordinal);
            int roots = 0;
            for (int index = 0; index < data.Bones.Count; index++)
            {
                SpriteBone editorBone = data.Bones[index];
                SpriteBone runtimeBone = data.RuntimeBones[index];
                bool valid = !string.IsNullOrWhiteSpace(editorBone.name) &&
                             string.Equals(editorBone.name, runtimeBone.name, StringComparison.Ordinal) &&
                             editorBone.parentId == runtimeBone.parentId &&
                             string.Equals(editorBone.guid, runtimeBone.guid, StringComparison.Ordinal) &&
                             IsFinite(editorBone.position) && IsFinite(editorBone.rotation) &&
                             IsFinite(editorBone.length) && editorBone.length >= 0f;
                if (editorBone.parentId < 0)
                {
                    roots++;
                }

                if (!string.IsNullOrEmpty(editorBone.guid) && !nonEmptyGuids.Add(editorBone.guid))
                {
                    valid = false;
                }

                if (!valid || editorBone.parentId < -1 || editorBone.parentId >= data.Bones.Count || editorBone.parentId == index)
                {
                    return false;
                }
            }

            return roots == 1 && HasAcyclicParents(data.RuntimeBones);
        }

        /// <summary>检查编辑器和运行时的顶点、索引及三角形几何数据。</summary>
        /// <param name="data">Sprite 数据快照。</param>
        /// <returns>每个三角形有效且非退化时返回 true。</returns>
        private static bool ValidateTopology(RiggingSpriteData data)
        {
            if (data.Vertices.Length < 3 || data.RuntimeVertices.Length != data.Vertices.Length ||
                data.Indices.Length < 3 || data.Indices.Length % 3 != 0 ||
                data.RuntimeTriangles.Length != data.Indices.Length)
            {
                return false;
            }

            for (int vertexIndex = 0; vertexIndex < data.Vertices.Length; vertexIndex++)
            {
                Vector2 authoringPosition = data.Vertices[vertexIndex].position;
                Vector3 runtimePosition = data.RuntimeVertices[vertexIndex];
                Vector2 expectedRuntimePosition = (authoringPosition - data.AuthoringPivotOffset) *
                                                  data.AuthoringToRuntimeScale;
                if (!IsFinite(authoringPosition) || !IsFinite(runtimePosition) ||
                    !IsFinite(expectedRuntimePosition) ||
                    !Approximately(expectedRuntimePosition.x, runtimePosition.x) ||
                    !Approximately(expectedRuntimePosition.y, runtimePosition.y))
                {
                    return false;
                }
            }

            for (int index = 0; index < data.Indices.Length; index += 3)
            {
                int a = data.Indices[index];
                int b = data.Indices[index + 1];
                int c = data.Indices[index + 2];
                if (a < 0 || b < 0 || c < 0 || a >= data.Vertices.Length || b >= data.Vertices.Length ||
                    c >= data.Vertices.Length || a == b || b == c || c == a ||
                    data.RuntimeTriangles[index] != a || data.RuntimeTriangles[index + 1] != b ||
                    data.RuntimeTriangles[index + 2] != c)
                {
                    return false;
                }

                Vector3 first = data.RuntimeVertices[a];
                Vector3 second = data.RuntimeVertices[b];
                Vector3 third = data.RuntimeVertices[c];
                double areaTwice = Math.Abs(((double)second.x - first.x) * ((double)third.y - first.y) -
                                            ((double)second.y - first.y) * ((double)third.x - first.x));
                if (double.IsNaN(areaTwice) || double.IsInfinity(areaTwice) || areaTwice <= TriangleAreaTolerance)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>检查所有顶点的四槽 BoneWeight 值和有效骨骼索引。</summary>
        /// <param name="data">Sprite 数据快照。</param>
        /// <returns>每个顶点权重均为有限非负值且归一化时返回 true。</returns>
        private static bool ValidateWeights(RiggingSpriteData data)
        {
            if (data.Vertices.Length == 0 || data.RuntimeBones.Length == 0)
            {
                return false;
            }

            foreach (Vertex2DMetaData vertex in data.Vertices)
            {
                BoneWeight weight = vertex.boneWeight;
                float sum = 0f;
                if (!AccumulateWeight(weight.weight0, weight.boneIndex0, data.RuntimeBones.Length, ref sum) ||
                    !AccumulateWeight(weight.weight1, weight.boneIndex1, data.RuntimeBones.Length, ref sum) ||
                    !AccumulateWeight(weight.weight2, weight.boneIndex2, data.RuntimeBones.Length, ref sum) ||
                    !AccumulateWeight(weight.weight3, weight.boneIndex3, data.RuntimeBones.Length, ref sum) ||
                    Math.Abs(sum - 1f) > WeightSumTolerance)
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>累加一个权重槽并验证索引；运行时 SpriteSkin 会检查包括零权重在内的四个索引。</summary>
        /// <param name="weight">权重值。</param>
        /// <param name="boneIndex">该槽的骨骼索引。</param>
        /// <param name="boneCount">骨骼总数。</param>
        /// <param name="sum">当前累计权重。</param>
        /// <returns>权重和索引均有效时返回 true。</returns>
        private static bool AccumulateWeight(float weight, int boneIndex, int boneCount, ref float sum)
        {
            if (!IsFinite(weight) || weight < 0f || boneIndex < 0 || boneIndex >= boneCount)
            {
                return false;
            }

            sum += weight;
            return IsFinite(sum);
        }

        /// <summary>检查 bind pose 数量和矩阵元素是否与骨骼数据一致。</summary>
        /// <param name="data">Sprite 数据快照。</param>
        /// <returns>所有矩阵元素有限且数量一致时返回 true。</returns>
        private static bool ValidateBindPoses(RiggingSpriteData data)
        {
            if (data.BindPoses.Length == 0 || data.BindPoses.Length != data.RuntimeBones.Length)
            {
                return false;
            }

            foreach (Matrix4x4 matrix in data.BindPoses)
            {
                for (int row = 0; row < 4; row++)
                {
                    for (int column = 0; column < 4; column++)
                    {
                        if (!IsFinite(matrix[row, column]))
                        {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        /// <summary>验证 SpriteBone 父索引不存在越界、自引用或环。</summary>
        /// <param name="bones">按运行时顺序排列的骨骼数组。</param>
        /// <returns>父级关系形成合法树时返回 true。</returns>
        private static bool HasAcyclicParents(SpriteBone[] bones)
        {
            byte[] states = new byte[bones.Length];
            for (int index = 0; index < bones.Length; index++)
            {
                if (!VisitParent(index, bones, states))
                {
                    return false;
                }
            }

            return true;
        }

        /// <summary>沿父索引遍历骨骼，并在回边处识别环。</summary>
        /// <param name="index">当前骨骼索引。</param>
        /// <param name="bones">骨骼数组。</param>
        /// <param name="states">0 未访问、1 正在访问、2 已完成。</param>
        /// <returns>当前父级链无环时返回 true。</returns>
        private static bool VisitParent(int index, SpriteBone[] bones, byte[] states)
        {
            if (states[index] == 1)
            {
                return false;
            }

            if (states[index] == 2)
            {
                return true;
            }

            states[index] = 1;
            int parentId = bones[index].parentId;
            if (parentId >= 0 && (parentId >= bones.Length || !VisitParent(parentId, bones, states)))
            {
                return false;
            }

            states[index] = 2;
            return true;
        }

        /// <summary>检查 Transform 是否为角色根节点或其后代。</summary>
        /// <param name="candidate">待检查 Transform。</param>
        /// <param name="root">角色 Prefab 根节点。</param>
        /// <returns>候选节点位于角色层级时返回 true。</returns>
        private static bool IsWithinRoot(Transform candidate, Transform root)
        {
            Transform current = candidate;
            while (current != null)
            {
                if (current == root)
                {
                    return true;
                }

                current = current.parent;
            }

            return false;
        }

        /// <summary>为无法读取的 Sprite 添加网格相关的阻断检查。</summary>
        /// <param name="checkPrefix">稳定检查 ID 前缀。</param>
        /// <param name="report">接收结果的报告。</param>
        /// <param name="reason">阻断原因。</param>
        private static void AddBlockedMeshChecks(string checkPrefix, QualityReportDto report, string reason)
        {
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bones", "rigging", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-mesh-topology", "rigging", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bone-weights", "rigging", "BLOCKED", reason);
            RiggingValidationReportBuilder.AddCheck(report, checkPrefix + "-bind-poses", "rigging", "BLOCKED", reason);
        }

        /// <summary>检查浮点数是否有限。</summary>
        /// <param name="value">待检查数值。</param>
        /// <returns>不是 NaN 或无穷值时返回 true。</returns>
        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        /// <summary>检查 Vector2 的两个坐标是否有限。</summary>
        /// <param name="value">待检查坐标。</param>
        /// <returns>两个分量均有限时返回 true。</returns>
        private static bool IsFinite(Vector2 value)
        {
            return IsFinite(value.x) && IsFinite(value.y);
        }

        /// <summary>检查 Vector3 的三个坐标是否有限。</summary>
        /// <param name="value">待检查坐标。</param>
        /// <returns>三个分量均有限时返回 true。</returns>
        private static bool IsFinite(Vector3 value)
        {
            return IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z);
        }

        /// <summary>检查 Quaternion 的四个分量是否有限。</summary>
        /// <param name="value">待检查旋转。</param>
        /// <returns>四个分量均有限时返回 true。</returns>
        private static bool IsFinite(Quaternion value)
        {
            return IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z) && IsFinite(value.w);
        }

        /// <summary>比较顶点数据的单精度坐标，并允许导入中的微小误差。</summary>
        /// <param name="left">第一个坐标值。</param>
        /// <param name="right">第二个坐标值。</param>
        /// <returns>有限坐标在容差内相等时返回 true。</returns>
        private static bool Approximately(float left, float right)
        {
            return IsFinite(left) && IsFinite(right) && Math.Abs(left - right) <= 0.0001f;
        }
    }
}
