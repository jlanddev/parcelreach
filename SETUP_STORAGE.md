# Setup Supabase Storage for File Uploads

## Step 1: Create Storage Bucket

1. Go to your Supabase Dashboard
2. Click **Storage** in the left sidebar  
3. Click **New bucket**
4. Enter bucket name: `lead-files`
5. Set to **Public** (so images can be viewed)
6. Click **Create bucket**

## Step 2: Set Storage Policies (Optional but Recommended)

After creating the bucket, click on it and go to **Policies**:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-files');

-- Allow public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'lead-files');

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-files' AND auth.uid() = owner);
```

## Step 3: Test

After creating the bucket, file uploads in notes will work!
