// Foremans that tests start as child processes inherit this, so prompts and feed lines are
// deterministic regardless of the OS account name.
process.env.COLISEUM_USER_NAME = 'Alex';
