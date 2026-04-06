// COMPLETE DIAGNOSTIC FOR PUBLIC WORKSPACES
// Copy and paste this ENTIRE script into your browser console on the Explore page
// Press Enter to run it

async function completePublicWorkspacesDiagnostic() {
  console.clear()
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('PUBLIC WORKSPACES - COMPLETE DIAGNOSTIC')
  console.log('═══════════════════════════════════════════════════════════════\n')
  
  try {
    // ============================================
    // STEP 1: Check Authentication
    // ============================================
    console.log('STEP 1: AUTHENTICATION CHECK')
    console.log('─────────────────────────────────────────────────────────────')
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('❌ AUTH ERROR:', authError)
      return
    }
    
    if (!user) {
      console.error('❌ NOT AUTHENTICATED')
      return
    }
    
    console.log('✅ Authenticated as:', user.id)
    console.log('   Email:', user.email)
    
    // ============================================
    // STEP 2: Count ALL workspaces in database
    // ============================================
    console.log('\n\nSTEP 2: COUNT ALL WORKSPACES')
    console.log('─────────────────────────────────────────────────────────────')
    
    const { data: allWs, error: allError, count: allCount } = await supabase
      .from('workspaces')
      .select('id, name, is_public, created_by, created_at', { count: 'exact' })
    
    if (allError) {
      console.error('❌ ERROR fetching all workspaces:', allError)
    } else {
      console.log(`✅ Total workspaces in DB: ${allCount}`)
      if (allWs && allWs.length > 0) {
        console.log('   Sample workspaces:')
        allWs.slice(0, 3).forEach(ws => {
          console.log(`   - ${ws.name} (ID: ${ws.id})`)
          console.log(`     is_public: ${ws.is_public}`)
          console.log(`     created_by: ${ws.created_by}`)
        })
      } else {
        console.log('   (No workspaces found)')
      }
    }
    
    // ============================================
    // STEP 3: Count PUBLIC workspaces
    // ============================================
    console.log('\n\nSTEP 3: COUNT PUBLIC WORKSPACES')
    console.log('─────────────────────────────────────────────────────────────')
    
    const { data: publicWs, error: pubError, count: pubCount } = await supabase
      .from('workspaces')
      .select('id, name, is_public, created_by, created_at', { count: 'exact' })
      .eq('is_public', true)
    
    if (pubError) {
      console.error('❌ ERROR fetching public workspaces:', pubError)
    } else {
      console.log(`✅ Public workspaces in DB: ${pubCount}`)
      if (publicWs && publicWs.length > 0) {
        console.log('   Public workspaces found:')
        publicWs.forEach(ws => {
          console.log(`   - ${ws.name} (ID: ${ws.id})`)
          console.log(`     created_by: ${ws.created_by}`)
          console.log(`     created_at: ${ws.created_at}`)
        })
      } else {
        console.log('   ⚠️  NO PUBLIC WORKSPACES IN DATABASE')
        console.log('   → You need to create workspaces and mark them as public!')
      }
    }
    
    // ============================================
    // STEP 4: Check YOUR workspaces
    // ============================================
    console.log('\n\nSTEP 4: YOUR WORKSPACES')
    console.log('─────────────────────────────────────────────────────────────')
    
    const { data: yourWs, error: yourError } = await supabase
      .from('workspaces')
      .select('id, name, is_public, created_by')
      .eq('created_by', user.id)
    
    if (yourError) {
      console.error('❌ ERROR fetching your workspaces:', yourError)
    } else {
      console.log(`✅ Your workspaces: ${yourWs?.length || 0}`)
      if (yourWs && yourWs.length > 0) {
        yourWs.forEach(ws => {
          const status = ws.is_public ? '🌍 PUBLIC' : '🔒 PRIVATE'
          console.log(`   ${status} - ${ws.name}`)
        })
      }
    }
    
    // ============================================
    // STEP 5: Check RLS Policies
    // ============================================
    console.log('\n\nSTEP 5: RLS POLICY CHECK')
    console.log('─────────────────────────────────────────────────────────────')
    console.log('Attempting to query public workspaces with RLS...')
    
    const { data: rlsTest, error: rlsError } = await supabase
      .from('workspaces')
      .select('id, name, is_public')
      .eq('is_public', true)
      .limit(5)
    
    if (rlsError) {
      console.error('❌ RLS POLICY ERROR:', rlsError.message)
      console.log('   This means RLS is still blocking public workspace reads!')
    } else {
      console.log(`✅ RLS policy allows reads: ${rlsTest?.length || 0} workspaces returned`)
      if (rlsTest && rlsTest.length > 0) {
        console.log('   First public workspace:', rlsTest[0].name)
      }
    }
    
    // ============================================
    // STEP 6: Test fetchAllPublicWorkspaces
    // ============================================
    console.log('\n\nSTEP 6: TEST fetchAllPublicWorkspaces FUNCTION')
    console.log('─────────────────────────────────────────────────────────────')
    
    // Import the function
    const module = await import('/src/lib/globalSearch.js')
    const { fetchAllPublicWorkspaces } = module
    
    console.log('Calling fetchAllPublicWorkspaces(10)...')
    const result = await fetchAllPublicWorkspaces(10)
    
    console.log('Result:', result)
    console.log(`- workspaces: ${result.workspaces?.length || 0}`)
    console.log(`- total: ${result.total}`)
    console.log(`- error: ${result.error}`)
    
    if (result.workspaces && result.workspaces.length > 0) {
      console.log('✅ Function returned workspaces!')
      result.workspaces.forEach(ws => {
        console.log(`   - ${ws.name}`)
      })
    } else {
      console.log('❌ Function returned EMPTY array')
    }
    
    // ============================================
    // STEP 7: SUMMARY & RECOMMENDATIONS
    // ============================================
    console.log('\n\nSTEP 7: SUMMARY & NEXT STEPS')
    console.log('═══════════════════════════════════════════════════════════════')
    
    if (!publicWs || publicWs.length === 0) {
      console.log('⚠️  NO PUBLIC WORKSPACES FOUND\n')
      console.log('ACTION REQUIRED:')
      console.log('1. Go to Dashboard')
      console.log('2. Create a new workspace')
      console.log('3. Enable the "Public workspace" checkbox')
      console.log('4. Click Create')
      console.log('5. Come back to this page and run diagnostic again')
    } else if (result.workspaces && result.workspaces.length > 0) {
      console.log('✅ EVERYTHING IS WORKING!\n')
      console.log('If the Discover section still doesn\'t show:')
      console.log('- Hard refresh the page (Ctrl+Shift+R)')
      console.log('- Check that publicWorkspaces.length > 0 in the component')
    } else {
      console.log('⚠️  PUBLIC WORKSPACES EXIST BUT FETCH IS FAILING\n')
      console.log('ACTION REQUIRED:')
      console.log('- Check the error in Step 6')
      console.log('- If RLS error in Step 5: SQL policy didn\'t apply correctly')
      console.log('- Run the fix SQL again in Supabase')
    }
    
  } catch (err) {
    console.error('DIAGNOSTIC ERROR:', err)
  }
}

// RUN IT
completePublicWorkspacesDiagnostic()
