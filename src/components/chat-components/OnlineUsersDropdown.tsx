import { Show, For, createMemo } from 'solid-js';
import { Badge } from '~/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '~/components/ui/dropdown-menu';
import type { ConnectedUser } from '~/lib/websocket-chat';

interface OnlineUsersDropdownProps {
    userCount: number;
    connectedUsers: ConnectedUser[];
}

export function OnlineUsersDropdown(props: OnlineUsersDropdownProps) {
    // Sort users alphabetically by name
    const sortedUsers = createMemo(() => {
        return [...props.connectedUsers].sort((a, b) =>
            a.userName.localeCompare(b.userName)
        );
    });

    return (
        <Show when={props.userCount > 0}>
            <DropdownMenu>
                <DropdownMenuTrigger as="div">
                    <Badge
                        variant="secondary"
                        class="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                    >
                        👥 {props.userCount} online
                    </Badge>
                </DropdownMenuTrigger>

                <DropdownMenuContent class="w-48 max-h-64 overflow-y-auto">
                    <DropdownMenuLabel class="text-sm font-medium">
                        Online Users ({props.userCount})
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <Show
                        when={props.connectedUsers.length > 0}
                        fallback={
                            <DropdownMenuItem disabled class="text-muted-foreground text-xs">
                                Loading users...
                            </DropdownMenuItem>
                        }
                    >
                        <For each={sortedUsers()}>
                            {(user) => (
                                <DropdownMenuItem class="cursor-default">
                                    <span class="text-sm truncate">
                                        {user.userName}
                                    </span>
                                </DropdownMenuItem>
                            )}
                        </For>
                    </Show>
                </DropdownMenuContent>
            </DropdownMenu>
        </Show>
    );
}