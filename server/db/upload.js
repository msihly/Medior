try {
    const AWS = require("aws-sdk");
    const { hash } = require("../utils");
    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION } = process.env;

    AWS.config.update({
        region: S3_REGION,
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    });

    const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

    const extensions = ["jpg", "jpeg", "png"];
    const maxFileSize = 2 * 1024 * 1024;

    exports.uploadFile = async (files) => {
        if (files.length === 0)
            return { success: false, errors: ["'Files' parameter empty"] };

        let errors = [];
        const { originalname: name, mimetype: type, size, buffer } = files[0];
        const ext = name.split(".").pop();

        if (!extensions.includes(ext))
            errors.push(`File extension ('${type}') not allowed`);
        if (size > maxImageSize)
            errors.push(`File size (${size} bytes) exceeds limit (${maxFileSize} bytes)`);
        if (errors.length > 0)
            return { success: false, errors };

        const fileHash = hash("md5", buffer);
        const path = `uploads/${fileHash.substr(0, 2)}/${fileHash.substr(2, 2)}/${fileHash}.${ext}`;
        const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${path}`;

        await s3.putObject({
            Bucket: S3_BUCKET,
            Key: path,
            Body: buffer,
            ACL: "public-read"
        }).promise();

        return { success: true, fileUrl: url };
    }
} catch (e) { console.error(e); return false; }