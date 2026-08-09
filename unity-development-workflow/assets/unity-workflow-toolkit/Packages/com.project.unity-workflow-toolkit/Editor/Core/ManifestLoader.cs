using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Project.UnityWorkflow.Core.Models;
using UnityEngine;

namespace Project.UnityWorkflow.Core
{
    /// <summary>
    /// 读取 JSON Manifest，并为已编译 Job 验证源文件与 payload 完整性。
    /// </summary>
    public static class ManifestLoader
    {
        /// <summary>
        /// 当前 Toolkit 能处理的工作流 Schema 版本。
        /// </summary>
        public const string SupportedSchemaVersion = "1.0";

        /// <summary>
        /// 从项目相对路径读取 DTO；若目标是 WorkflowJobDto，还会完成完整信任链校验。
        /// </summary>
        /// <typeparam name="T">目标 DTO 类型。</typeparam>
        /// <param name="projectRelativePath">JSON 文件的项目相对路径。</param>
        /// <returns>反序列化且已按类型验证的 DTO。</returns>
        public static T Load<T>(string projectRelativePath) where T : class
        {
            var absolutePath = WorkflowPaths.ResolveProjectRelative(projectRelativePath);
            if (!File.Exists(absolutePath))
            {
                throw new FileNotFoundException("工作流 JSON 文件不存在。");
            }

            var json = File.ReadAllText(absolutePath, new UTF8Encoding(false, true));
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new InvalidDataException("工作流 JSON 文件为空。");
            }

            JObject root;
            try
            {
                root = ParseJsonObject(json);
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException("工作流 JSON 不是有效的 JSON 对象。", exception);
            }

            var schemaVersion = root.Value<string>("schemaVersion");
            if (string.IsNullOrWhiteSpace(schemaVersion))
            {
                throw new InvalidDataException("工作流 JSON 缺少 schemaVersion。");
            }

            if (!string.Equals(schemaVersion, SupportedSchemaVersion, StringComparison.Ordinal))
            {
                throw new NotSupportedException($"不支持 Schema 版本 {schemaVersion}。");
            }

            T value;
            try
            {
                value = JsonUtility.FromJson<T>(json);
            }
            catch (ArgumentException exception)
            {
                throw new InvalidDataException("工作流 JSON 无法转换为目标 DTO。", exception);
            }

            if (value == null)
            {
                throw new InvalidDataException($"无法把工作流 JSON 反序列化为 {typeof(T).Name}。");
            }

            if (value is IWorkflowJobDto job && value is IWorkflowJobIntegrityState integrityState)
            {
                ValidateCompiledJob(root, job);
                integrityState.MarkIntegrityVerified();
            }

            return value;
        }

        /// <summary>关闭日期自动转换后解析根对象，避免规范化哈希改变时间字符串。</summary>
        private static JObject ParseJsonObject(string json)
        {
            using (var textReader = new StringReader(json))
            using (var jsonReader = new JsonTextReader(textReader) { DateParseHandling = DateParseHandling.None })
            {
                var token = JToken.ReadFrom(jsonReader);
                if (token is JObject root)
                {
                    return root;
                }

                throw new JsonReaderException("工作流 JSON 根必须是对象。");
            }
        }

        /// <summary>验证源契约路径、源字节哈希和规范化 payload 哈希。</summary>
        private static void ValidateCompiledJob(JObject root, IWorkflowJobDto job)
        {
            if (string.IsNullOrWhiteSpace(job.SourcePath))
            {
                throw new InvalidDataException("编译 Job 缺少 sourcePath。");
            }

            if (!IsSha256(job.SourceSha256) || !IsSha256(job.PayloadSha256))
            {
                throw new InvalidDataException("编译 Job 缺少有效的完整性哈希。");
            }

            var payload = root["payload"];
            if (payload == null || payload.Type != JTokenType.Object)
            {
                throw new InvalidDataException("编译 Job 缺少对象类型 payload。");
            }

            var actualPayloadHash = ComputeSha256(Encoding.UTF8.GetBytes(Canonicalize(payload)));
            if (!string.Equals(job.PayloadSha256, actualPayloadHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("编译 Job 的 payloadSha256 与 payload 不一致。");
            }

            var sourceAbsolutePath = WorkflowPaths.ResolveProjectRelative(job.SourcePath);
            if (!File.Exists(sourceAbsolutePath))
            {
                throw new FileNotFoundException("编译 Job 的源契约文件不存在。");
            }

            var actualSourceHash = ComputeSha256(File.ReadAllBytes(sourceAbsolutePath));
            if (!string.Equals(job.SourceSha256, actualSourceHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidDataException("编译 Job 的 sourceSha256 与当前源文件不一致。");
            }
        }

        /// <summary>按键名递归排序并生成与 Node 文件工具一致的无空白 JSON。</summary>
        private static string Canonicalize(JToken token)
        {
            return SortToken(token).ToString(Formatting.None);
        }

        /// <summary>递归复制 JSON，并按序数规则排序所有对象属性。</summary>
        private static JToken SortToken(JToken token)
        {
            if (token is JObject sourceObject)
            {
                var ordered = new JObject();
                foreach (var property in sourceObject.Properties().OrderBy(item => item.Name, StringComparer.Ordinal))
                {
                    ordered.Add(property.Name, SortToken(property.Value));
                }

                return ordered;
            }

            if (token is JArray sourceArray)
            {
                var ordered = new JArray();
                foreach (var item in sourceArray)
                {
                    ordered.Add(SortToken(item));
                }

                return ordered;
            }

            return token.DeepClone();
        }

        /// <summary>计算小写十六进制 SHA-256。</summary>
        private static string ComputeSha256(byte[] bytes)
        {
            using (var algorithm = SHA256.Create())
            {
                return BitConverter.ToString(algorithm.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }

        /// <summary>检查文本是否为完整的 64 位十六进制 SHA-256。</summary>
        private static bool IsSha256(string value)
        {
            return !string.IsNullOrWhiteSpace(value) && value.Length == 64 && value.All(Uri.IsHexDigit);
        }
    }
}
