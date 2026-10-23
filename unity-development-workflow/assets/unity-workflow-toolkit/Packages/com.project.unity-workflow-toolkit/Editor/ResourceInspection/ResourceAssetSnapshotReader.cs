using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Project.UnityWorkflow.Core;
using UnityEditor;

namespace Project.UnityWorkflow.ResourceInspection
{
    /// <summary>从 AssetDatabase 读取资源身份、全工程 Resources key 与 Addressables entry。</summary>
    internal static class ResourceAssetSnapshotReader
    {
        private const BindingFlags PublicInstance = BindingFlags.Instance | BindingFlags.Public;
        private const BindingFlags PublicStatic = BindingFlags.Static | BindingFlags.Public;

        /// <summary>读取请求资产的实际主资源信息；任一配置事实不可读时返回中文诊断。</summary>
        /// <param name="request">单条资产请求。</param>
        /// <param name="error">读取失败时的安全诊断。</param>
        /// <returns>包含实际读取字段或空字段的快照。</returns>
        public static ResourceHandoffAssetSnapshot Read(ResourceHandoffAssetRequest request, out string error)
        {
            error = null;
            var snapshot = new ResourceHandoffAssetSnapshot
            {
                resourceId = request == null ? null : request.resourceId,
                assetPath = request == null ? null : request.assetPath,
                resourcesMatches = new List<ResourceHandoffResourceMatch>()
            };

            if (request == null || string.IsNullOrWhiteSpace(request.resourceId))
            {
                error = "存在缺少 resourceId 的资源请求。";
                return snapshot;
            }

            try
            {
                string path = ResourceHandoffPath.RequireAssetPath(request.assetPath);
                if (AssetDatabase.IsValidFolder(path))
                {
                    error = "资源登记项未指向可读取的 Unity 主资源。";
                    return snapshot;
                }

                string guid = AssetDatabase.AssetPathToGUID(path);
                string actualPath = string.IsNullOrWhiteSpace(guid)
                    ? string.Empty
                    : AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrWhiteSpace(actualPath) ||
                    !string.Equals(actualPath, path, StringComparison.Ordinal) ||
                    AssetDatabase.GetMainAssetTypeAtPath(actualPath) == null)
                {
                    error = "资源请求路径未映射到可验证的 Unity 主资源。";
                    return snapshot;
                }

                snapshot.assetPath = actualPath;
                snapshot.assetGuid = guid;
                snapshot.resourcesKey = GetResourcesKey(actualPath, out string pathError) ?? string.Empty;
                if (!string.IsNullOrEmpty(pathError))
                {
                    error = pathError;
                    return snapshot;
                }

                if (!string.IsNullOrEmpty(snapshot.resourcesKey))
                {
                    snapshot.resourcesMatches = FindResourcesMatches(snapshot.resourcesKey, out string collisionError);
                    if (!string.IsNullOrEmpty(collisionError))
                    {
                        error = collisionError;
                        return snapshot;
                    }

                    if (snapshot.resourcesMatches.Count == 0 ||
                        !snapshot.resourcesMatches.Any(match =>
                            string.Equals(match.assetGuid, guid, StringComparison.Ordinal)))
                    {
                        error = "Resources key 未能映射回请求资源的实际 GUID。";
                        return snapshot;
                    }
                }

                snapshot.addressables = ReadAddressables(guid);
                return snapshot;
            }
            catch (ArgumentException)
            {
                error = "资源路径不符合项目内 Assets 路径约定。";
                return snapshot;
            }
            catch (Exception)
            {
                error = "Unity 无法读取资源登记项的加载配置。";
                return snapshot;
            }
        }

        /// <summary>根据唯一 Resources 文件夹计算 Unity 动态加载 key。</summary>
        /// <param name="assetPath">实际资源路径。</param>
        /// <param name="error">Resources 文件夹嵌套或路径无效时返回诊断。</param>
        /// <returns>不含扩展名的 key；不在 Resources 下时为空字符串。</returns>
        private static string GetResourcesKey(string assetPath, out string error)
        {
            error = null;
            string[] segments = assetPath.Split('/');
            int[] resourceIndexes = Enumerable.Range(0, segments.Length)
                .Where(index => string.Equals(segments[index], "Resources", StringComparison.Ordinal))
                .ToArray();
            if (resourceIndexes.Length == 0)
            {
                return string.Empty;
            }

            if (resourceIndexes.Length > 1)
            {
                error = "资源路径包含嵌套 Resources 文件夹，动态 key 无法安全判定。";
                return null;
            }

            int resourceIndex = resourceIndexes[0];
            if (resourceIndex >= segments.Length - 1)
            {
                error = "Resources 目录本身不是可动态加载的资源文件。";
                return null;
            }

            string fileName = Path.GetFileNameWithoutExtension(segments[segments.Length - 1]);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                error = "Resources 资源缺少有效文件名。";
                return null;
            }

            string[] keySegments = segments.Skip(resourceIndex + 1).ToArray();
            keySegments[keySegments.Length - 1] = fileName;
            return string.Join("/", keySegments);
        }

        /// <summary>枚举全工程具有相同 key 的实际 Resources 主资源。</summary>
        /// <param name="key">已规范化的动态加载 key。</param>
        /// <param name="error">检测到相关嵌套 Resources key 时返回诊断。</param>
        /// <returns>路径和 GUID 均来自 AssetDatabase 的匹配项。</returns>
        private static List<ResourceHandoffResourceMatch> FindResourcesMatches(string key, out string error)
        {
            error = null;
            var matches = new List<ResourceHandoffResourceMatch>();
            foreach (string path in AssetDatabase.GetAllAssetPaths())
            {
                if (AssetDatabase.IsValidFolder(path))
                {
                    continue;
                }

                string candidateKey = GetResourcesKey(path, out string candidateError);
                if (!string.IsNullOrEmpty(candidateError))
                {
                    if (HasPotentialNestedKey(path, key))
                    {
                        error = candidateError;
                        return matches;
                    }

                    continue;
                }

                if (!string.Equals(candidateKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string guid = AssetDatabase.AssetPathToGUID(path);
                string actualPath = string.IsNullOrWhiteSpace(guid)
                    ? string.Empty
                    : AssetDatabase.GUIDToAssetPath(guid);
                if (string.IsNullOrWhiteSpace(actualPath) ||
                    !string.Equals(actualPath, path, StringComparison.Ordinal) ||
                    AssetDatabase.GetMainAssetTypeAtPath(actualPath) == null)
                {
                    continue;
                }

                matches.Add(new ResourceHandoffResourceMatch { assetPath = actualPath, assetGuid = guid });
            }

            return matches;
        }

        /// <summary>判断嵌套 Resources 路径是否可能遮蔽当前被查询的 key。</summary>
        /// <param name="assetPath">扫描到的嵌套资源路径。</param>
        /// <param name="key">当前请求资源的 key。</param>
        /// <returns>潜在 key 相同则为 true。</returns>
        private static bool HasPotentialNestedKey(string assetPath, string key)
        {
            string[] segments = assetPath.Split('/');
            int first = Array.FindIndex(segments, segment =>
                string.Equals(segment, "Resources", StringComparison.Ordinal));
            if (first < 0 || first >= segments.Length - 1)
            {
                return false;
            }

            string[] candidateSegments = segments.Skip(first + 1).ToArray();
            candidateSegments[candidateSegments.Length - 1] =
                Path.GetFileNameWithoutExtension(candidateSegments[candidateSegments.Length - 1]);
            return string.Equals(
                string.Join("/", candidateSegments),
                key,
                StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>仅通过已加载的 Addressables Editor API 读取真实 GUID entry。</summary>
        /// <param name="guid">AssetDatabase 返回的资源 GUID。</param>
        /// <returns>不存在 Addressables 包或设置时的空事实；否则返回实际 entry 数据。</returns>
        private static ResourceHandoffAddressablesSnapshot ReadAddressables(string guid)
        {
            const string settingsTypeName =
                "UnityEditor.AddressableAssets.AddressableAssetSettingsDefaultObject";
            Type settingsType = Type.GetType(settingsTypeName + ", Unity.Addressables.Editor", false) ??
                                AppDomain.CurrentDomain.GetAssemblies()
                .Select(assembly => assembly.GetType(settingsTypeName, false))
                .FirstOrDefault(type => type != null);
            if (settingsType == null)
            {
                return UnconfiguredAddressables();
            }

            MemberInfo settingsMember = FindMember(settingsType, "Settings", PublicStatic);
            if (settingsMember == null)
            {
                throw new InvalidOperationException("Addressables Settings API 不受支持。");
            }

            object settings = ReadMember(settingsMember, null);
            if (settings == null)
            {
                return UnconfiguredAddressables();
            }

            MethodInfo findEntry = settings.GetType().GetMethod(
                "FindAssetEntry",
                PublicInstance,
                null,
                new[] { typeof(string), typeof(bool) },
                null);
            if (findEntry == null)
            {
                throw new InvalidOperationException("Addressables entry 查询 API 不受支持。");
            }

            // 仅取显式 Addressables entry，避免把目录等隐式条目误当作已配置资源。
            object entry = findEntry.Invoke(settings, new object[] { guid, false });
            if (entry == null)
            {
                return UnconfiguredAddressables();
            }

            MemberInfo addressMember = FindMember(entry.GetType(), "address", PublicInstance);
            MemberInfo groupMember = FindMember(entry.GetType(), "parentGroup", PublicInstance);
            if (addressMember == null || groupMember == null)
            {
                throw new InvalidOperationException("Addressables entry 缺少可读取的 address 或 group。");
            }

            object group = ReadMember(groupMember, entry);
            MemberInfo nameMember = group == null ? null : FindMember(group.GetType(), "Name", PublicInstance);
            return new ResourceHandoffAddressablesSnapshot
            {
                configured = true,
                address = ReadMember(addressMember, entry) as string ?? string.Empty,
                group = nameMember == null ? string.Empty : ReadMember(nameMember, group) as string ?? string.Empty
            };
        }

        /// <summary>创建缺少 Addressables 配置时的明确空事实。</summary>
        /// <returns>未配置且 address/group 为空字符串的结果。</returns>
        private static ResourceHandoffAddressablesSnapshot UnconfiguredAddressables()
        {
            return new ResourceHandoffAddressablesSnapshot
            {
                configured = false,
                address = string.Empty,
                group = string.Empty
            };
        }

        /// <summary>按名称查找公开属性或字段，适配 Addressables 版本间的成员形式。</summary>
        /// <param name="type">成员声明类型。</param>
        /// <param name="name">成员名称。</param>
        /// <param name="flags">静态或实例公开成员范围。</param>
        /// <returns>找到的属性或字段；不存在时为 null。</returns>
        private static MemberInfo FindMember(Type type, string name, BindingFlags flags)
        {
            return (MemberInfo)type.GetProperty(name, flags) ?? type.GetField(name, flags);
        }

        /// <summary>读取已定位的 Addressables 属性或字段值。</summary>
        /// <param name="member">待读取成员。</param>
        /// <param name="target">实例成员宿主；静态成员传 null。</param>
        /// <returns>实际成员值。</returns>
        private static object ReadMember(MemberInfo member, object target)
        {
            if (member is PropertyInfo property)
            {
                return property.GetValue(target, null);
            }

            return ((FieldInfo)member).GetValue(target);
        }
    }
}
