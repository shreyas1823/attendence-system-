import { Search, Users } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { Pagination } from '@/components/common/Pagination'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/form'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { SlotDots } from '@/features/students/StudentBiometricStatus'
import { StudentProfileDialog } from '@/features/students/StudentProfileDialog'
import { useClasses, useStudents } from '@/hooks/queries'
import { useDebounced } from '@/hooks/useDebounced'

export default function StudentsPage() {
  const [search, setSearch] = useState('')
  const [classId, setClassId] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const debounced = useDebounced(search)
  const classes = useClasses()
  const { data, isPending, isError, refetch, isPlaceholderData } = useStudents({ page, search: debounced, class_id: classId })

  return (
    <>
      <PageHeader title="Students" description="Registered students and their fingerprint enrollment." />

      <Card>
        <div className="flex flex-wrap gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              className="pl-8"
              placeholder="Search name or roll number"
              aria-label="Search students"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            className="w-40"
            aria-label="Filter by class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : (
          <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Roll no.</TH>
                  <TH>Name</TH>
                  <TH>Class</TH>
                  <TH>Fingerprints</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              {isPending ? (
                <TableSkeleton rows={8} cols={5} />
              ) : (
                <TBody>
                  {data.data.map((s) => (
                    <TR key={s.id}>
                      <TD className="tabular-nums text-muted-foreground">{s.student_id}</TD>
                      <TD className="font-medium">{s.name}</TD>
                      <TD>{s.class_name}</TD>
                      <TD>
                        <SlotDots slots={s.enrolled_slots} />
                      </TD>
                      <TD className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelected(s.id)} aria-label={`View ${s.name}`}>
                          View
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              )}
            </Table>
            {data?.data.length === 0 && (
              <EmptyState icon={Users} title="No students found" description="Try a different search or clear the class filter." />
            )}
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      </Card>

      <StudentProfileDialog studentId={selected} onClose={() => setSelected(null)} />
    </>
  )
}
