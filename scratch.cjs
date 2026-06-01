const fs = require('fs');
const path = 'd:/Projects/VaultNotes/src/pages/Chat.jsx';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '      await fetchGroupMembers(group.id)\n\n      // Unsubscribe from old channel if exists';
const endMarker = '        .subscribe()\n    },\n    [fetchGroupMessages, fetchGroupMembers, fetchGroupMessageReads]\n  )';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker) + endMarker.length;

if (startIndex === -1 || endIndex === -1) {
  console.log('Markers not found');
  process.exit(1);
}

const extractedBlock = content.substring(startIndex + '      await fetchGroupMembers(group.id)'.length, content.indexOf(endMarker));

const newEffect = `

  useEffect(() => {
    if (!activeGroupId || chatMode !== 'groups') return;

    const group = groups.find((g) => g.id === activeGroupId);
    if (!group) return;
` + extractedBlock + `
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(readsChannel);
      
      if (groupMessagesChannelRef.current === channel) {
        groupMessagesChannelRef.current = null;
      }
      if (groupReactionsChannelRef.current === reactionsChannel) {
        groupReactionsChannelRef.current = null;
      }
    };
  }, [activeGroupId]);
`;

const beforeHandleSelectGroup = content.substring(0, content.indexOf('  const handleSelectGroup = useCallback('));
const insideHandleSelectGroup = content.substring(content.indexOf('  const handleSelectGroup = useCallback('), startIndex + '      await fetchGroupMembers(group.id)'.length);
const afterHandleSelectGroup = content.substring(content.indexOf(endMarker) + endMarker.length);

const finalContent = beforeHandleSelectGroup + newEffect + '\n' + insideHandleSelectGroup + '\n    },\n    [fetchGroupMessages, fetchGroupMembers, fetchGroupMessageReads]\n  )' + afterHandleSelectGroup;

fs.writeFileSync(path, finalContent, 'utf8');
console.log('Successfully updated Chat.jsx');
