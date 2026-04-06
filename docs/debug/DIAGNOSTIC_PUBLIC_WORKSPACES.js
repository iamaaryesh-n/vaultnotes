// Diagnostic test to check public workspaces visibility
// Run this in the browser console on the Explore page

async function diagnosePublicWorkspaces() {
  console.log('=== PUBLIC WORKSPACES DIAGNOSTIC ===\n')
  
  // Import the fetch function
  const { fetchAllPublicWorkspaces } = await import('/src/lib/globalSearch.js')
  
  // Step 1: Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('1. USER AUTHENTICATION:')
  console.log('   - Authenticated:', !!user)
  console.log('   - User ID:', user?.id)
  console.log('   - Auth Error:', authError)
  
  // Step 2: Direct query to check what's in the database
  console.log('\n2. DIRECT DATABASE QUERY:')
  const { data: allWorkspaces, error: directError } = await supabase
    .from('workspaces')
    .select('id, name, is_public, created_by')
    .limit(20)
  
  console.log('   - Total workspaces in DB:', allWorkspaces?.length)
  console.log('   - Data:', allWorkspaces)
  console.log('   - Error:', directError)
  
  // Step 3: Check public workspaces only
  console.log('\n3. PUBLIC WORKSPACES QUERY:')
  const { data: publicWs, error: publicError } = await supabase
    .from('workspaces')
    .select('id, name, is_public, created_by')
    .eq('is_public', true)
  
  console.log('   - Public workspaces in DB:', publicWs?.length)
  console.log('   - Data:', publicWs)
  console.log('   - Error:', publicError)
  
  // Step 4: Use the app function
  console.log('\n4. FETCH ALL PUBLIC WORKSPACES FUNCTION:')
  const { workspaces, error, total } = await fetchAllPublicWorkspaces(10)
  console.log('   - Returned workspaces:', workspaces?.length)
  console.log('   - Total count:', total)
  console.log('   - Data:', workspaces)
  console.log('   - Error:', error)
  
  // Step 5: Summary
  console.log('\n5. SUMMARY:')
  if (publicWs && publicWs.length > 0) {
    console.log('   ✅ Public workspaces EXIST in database')
    console.log('   ✓ Sample:', publicWs[0])
  } else {
    console.log('   ❌ NO public workspaces found in database')
    console.log('   → You need to create workspaces and mark them as public')
  }
  
  if (workspaces && workspaces.length > 0) {
    console.log('   ✅ fetchAllPublicWorkspaces is WORKING')
  } else {
    console.log('   ❌ fetchAllPublicWorkspaces returned EMPTY')
    if (publicWs && publicWs.length > 0) {
      console.log('   → Issue: RLS policy might be blocking SELECT')
    } else {
      console.log('   → Issue: No data in database')
    }
  }
}

// Run it
diagnosePublicWorkspaces()
